"use client";

import Link from "next/link";
import { type FormEvent, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { ChatMessage } from "@/lib/claude/types";
import type { ChannelView, PersonView } from "@/lib/destination/types";
import type { KnowledgeResult } from "@/lib/knowledge";
import { PROMISE_FULL, PROMISE_SHORT, promiseCookieName } from "@/lib/promise-cookie";
import { TRIAL_PROMISE_FULL, TRIAL_PROMISE_SHORT } from "@/lib/trial";
import { useTrial } from "./TrialContext";
import { KnowledgeResults } from "./chie/KnowledgeResults";
import { Compose, type ComposeStart } from "./Compose";
import { ConnectCard, type ConnectSuggestion } from "./ConnectCard";
import { SafetyCard, type SafetyNotice } from "./SafetyCard";
import { AttachmentPreview } from "./AttachmentPreview";
import { Avatar } from "./Avatar";
import { playSendSound, SendBurst } from "./SendBurst";
import type { AttachmentView } from "@/lib/attachment";
import { loadTalk, saveTalk } from "./talk-storage";
import { isSpeechSupported, startListening } from "./speech";
import { Icon } from "./Icon";
import { ClickWheel } from "./ClickWheel";

const MAX_TEXT_LENGTH = 2000;
/** これより長く押していたら「押している間だけ聞く」使い方として、離すと止める */
const HOLD_TO_TALK_MS = 450;
const WHEEL_PIXELS_PER_DEGREE = 2.2;
const MAX_HISTORY = 40;
/** 話の途中で声をかけないよう、少なくとも2往復してから確かめる */
const CONNECT_MIN_MESSAGES = 4;

export function Talk({
  viewer,
  question,
  initialAsk = null,
  viewerId,
  promiseSeen = false,
  avatarImage,
  initialGoal = null,
  device = false,
  companion,
}: {
  viewer: { name: string; label: string };
  question: string | null;
  initialAsk?: { id: string; name: string } | null;
  viewerId: string;
  promiseSeen?: boolean;
  avatarImage?: string;
  /** 頑張りたいことを乗り越えて「みんなに言っておく」で来たとき */
  initialGoal?: { id: string; text: string } | null;
  /** 液晶とホイールの配置（レトロ）。声は送らず入力欄に入り、直してから送る */
  device?: boolean;
  /** 液晶に出す相棒 */
  companion?: ReactNode;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [scripted, setScripted] = useState(false);
  const [composing, setComposing] = useState<ComposeStart | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [safety, setSafety] = useState<SafetyNotice | null>(null);
  const [suggestion, setSuggestion] = useState<ConnectSuggestion | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentView | null>(null);
  const [uploading, setUploading] = useState(false);
  const [remembered, setRemembered] = useState<number[]>([]);
  const [askTarget, setAskTarget] = useState(initialAsk);
  const trial = useTrial();
  const [acknowledged, setAcknowledged] = useState(promiseSeen);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<KnowledgeResult[] | null>(null);
  const [goalSuggestion, setGoalSuggestion] = useState<string | null>(null);
  const [goalDone, setGoalDone] = useState<{ id: string; text: string } | null>(null);
  const [goalForPost, setGoalForPost] = useState<{ id: string; text: string } | null>(initialGoal);
  const goalAsked = useRef(false);
  const connectDone = useRef(false);
  const [sentTo, setSentTo] = useState<{ channel: ChannelView; postId: string; isPublic: boolean } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const pressedAt = useRef<number | null>(null);

  useEffect(() => {
    // 液晶の配置では、やり取りは枠の中だけで動かし、画面全体は動かさない
    if (device) {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      return;
    }
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [device, messages, sending, heard, safety, suggestion, goalSuggestion, goalDone, found, notice, sentTo, attachment]);

  useEffect(() => () => stopRef.current?.(), []);

  // 画面を行き来しても話が消えないよう、このタブの中だけに残す。サーバーには保存しない
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) {
      saveTalk(viewer.name, messages);
      return;
    }
    restored.current = true;
    const saved = loadTalk(viewer.name);
    const goalLine = initialGoal ? `頑張りたいことの「${initialGoal.text}」ができた！` : null;
    const withGoal: ChatMessage[] =
      goalLine && saved.at(-1)?.content !== goalLine ? [...saved, { role: "user", content: goalLine }] : saved;
    if (withGoal.length > 0) setMessages(withGoal);
  }, [messages, viewer.name]);

  function rememberPromiseSeen() {
    document.cookie = `${promiseCookieName(viewerId)}=1; path=/; max-age=31536000; samesite=lax`;
  }

  async function send(raw: string) {
    rememberPromiseSeen();
    const text = raw.trim();
    if (!text || sending) return;

    const history = messages.slice(-MAX_HISTORY);
    setMessages([...messages, { role: "user", content: text }]);
    setDraft("");
    setNotice("");
    setSending(true);
    try {
      const response = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, text }),
      });
      const { reply, mode, safety: notice } = (await response.json().catch(() => ({}))) as {
        reply?: string;
        mode?: string;
        safety?: SafetyNotice;
      };
      // 返事が作れなくても、相談室に伝えたことは必ず本人に知らせる
      if (notice) setSafety(notice);
      if (!response.ok || !reply) throw new Error(`status ${response.status}`);
      const updated: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ];
      setMessages(updated);
      setScripted(mode === "scripted");
      // 命や安全の案内が出ているときは、人の紹介をしない
      if (notice) connectDone.current = true;
      void checkConnect(updated);
      if (!notice) void checkGoals(updated);
    } catch {
      // 話した言葉を失わないよう、書く欄に戻す
      setMessages(messages);
      setDraft(text);
      setWriting(true);
      setNotice("つながりませんでした。言葉は残してあるので、もう一度送ってください。");
    } finally {
      setSending(false);
    }
  }

  async function checkConnect(history: ChatMessage[]) {
    if (connectDone.current || history.length < CONNECT_MIN_MESSAGES) return;
    try {
      const response = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(-MAX_HISTORY) }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { suggestion: ConnectSuggestion | null };
      if (body.suggestion && !connectDone.current) {
        // 売り込まないよう、1回の会話で声をかけるのは1度だけ
        connectDone.current = true;
        setSuggestion(body.suggestion);
      }
    } catch {
      // 声かけは無くても困らないので、黙って見送る
    }
  }

  // 話の中に頑張りたいことや「できた」があれば聞く。残すかは本人が押して決める
  async function checkGoals(history: ChatMessage[]) {
    try {
      const response = await fetch("/api/goals/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history.slice(-MAX_HISTORY) }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as { suggestion: string | null; done: { id: string; text: string } | null };
      if (body.done) setGoalDone(body.done);
      else if (body.suggestion && !goalAsked.current) {
        // 売り込まないよう、1回の会話で聞くのは1度だけ
        goalAsked.current = true;
        setGoalSuggestion(body.suggestion);
      }
    } catch {
      // 声かけは無くても困らないので、黙って見送る
    }
  }

  async function saveGoal(body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!response?.ok) setNotice("残せませんでした。もう一度押してください。");
    return response?.ok === true;
  }

  async function startCompose(asked?: { id: string; name: string }, goal = goalForPost) {
    setPreparing(true);
    setNotice("");
    setSentTo(null);
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages.slice(-MAX_HISTORY), askedPersonId: asked?.id, attachmentId: attachment?.id }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const { draft, review, channels, people, attachment: checked } = (await response.json()) as {
        draft: Draft;
        review: Review | null;
        channels: ChannelView[];
        people: PersonView[];
        attachment?: ComposeStart["attachment"];
      };
      if (!draft.ready || !review) {
        setNotice("まだ投稿にできるお話がなさそう。もう少し聞かせてください。");
        return;
      }
      setSuggestion(null);
      setComposing({ draft, review, channels, people, asked, attachment: checked, goalId: goal?.id });
    } catch {
      setNotice("下書きを作れませんでした。もう一度押してください。");
    } finally {
      setPreparing(false);
    }
  }

  // 押したときだけ探す。話した言葉はこの呼び出しの中だけで使い、保存しない
  async function findKnowledge() {
    setFinding(true);
    setNotice("");
    try {
      const query = messages
        .filter((message) => message.role === "user")
        .slice(-3)
        .map((message) => message.content)
        .join("\n")
        .slice(0, MAX_TEXT_LENGTH);
      const response = await fetch("/api/chie/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { results: KnowledgeResult[] };
      setFound(body.results);
    } catch {
      setNotice("探せませんでした。もう一度押してください。");
    } finally {
      setFinding(false);
    }
  }

  // 話しただけのことは、本人が頼んだものだけを残す
  async function remember(index: number, text: string) {
    setNotice("");
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remember", text }),
    }).catch(() => null);
    if (response?.ok) setRemembered((current) => [...current, index]);
    else setNotice("覚えられませんでした。もう一度押してください。");
  }

  async function undoSent() {
    if (!sentTo) return;
    setNotice("");
    const response = await fetch("/api/publish/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: sentTo.postId }),
    }).catch(() => null);
    if (response?.ok) {
      setSentTo(null);
      setNotice("取り消しました。言葉はもう一度作り直せます。");
    } else {
      setNotice("もう取り消せません（返信が付いたか、時間が過ぎました）。");
    }
  }

  function listen() {
    setNotice("");
    if (!isSpeechSupported()) {
      setWriting(true);
      setNotice("このブラウザでは声が使えません。文字で書いてください。");
      return;
    }
    setHeard("");
    setListening(true);
    stopRef.current = startListening({
      onInterim: setHeard,
      onFinal: (text) => {
        if (device) setDraft((current) => (current ? `${current}\n${text}` : text).slice(0, MAX_TEXT_LENGTH));
        else void send(text);
      },
      onError: setNotice,
      onEnd: () => {
        setListening(false);
        setHeard("");
        stopRef.current = null;
      },
    });
  }

  async function attach(file: File) {
    setUploading(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/attachments", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as AttachmentView & { error?: string };
      if (!response.ok) {
        setNotice(body.error ?? "付けられませんでした。もう一度選んでください。");
        return;
      }
      setAttachment({ id: body.id, mediaType: body.mediaType, fileName: body.fileName });
    } catch {
      setNotice("付けられませんでした。もう一度選んでください。");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment() {
    if (!attachment) return;
    const { id } = attachment;
    setAttachment(null);
    await fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  if (composing) {
    return (
      <div className="talk" data-viewer={viewer.name}>
        <Compose
          {...composing}
          viewer={viewer}
          onCancel={() => setComposing(null)}
          onReplaceAttachment={() => {
            void removeAttachment();
            setComposing(null);
            setNotice("撮り直したものや別のファイルを、もう一度付けてください。");
          }}
          onSent={(channel, postId, words, isPublic) => {
            setComposing(null);
            setSentTo({ channel, postId, isPublic });
            setGoalForPost(null);
            setAttachment(null);
            setBurst(words);
            playSendSound(words);
          }}
        />
      </div>
    );
  }

  const canCompose = messages.some((message) => message.role === "user");

  const bubbleList = (
    <>
        {messages.map((message, index) => (
          <Fragment key={index}>
            <p className={`bubble ${message.role}`}>
              <span className="visually-hidden">{message.role === "user" ? "あなた：" : "相棒："}</span>
              {message.content}
            </p>
            {message.role === "user" && (
              <button
                type="button"
                className="remember"
                disabled={remembered.includes(index)}
                onClick={() => void remember(index, message.content)}
              >
                {remembered.includes(index) ? "覚えました" : "これを覚えて"}
              </button>
            )}
          </Fragment>
        ))}
    </>
  );

  const cards = (
    <>
      {suggestion && (
        <ConnectCard
          suggestion={suggestion}
          busy={preparing}
          onAccept={() => void startCompose({ id: suggestion.personId, name: suggestion.name })}
          onDecline={() => setSuggestion(null)}
        />
      )}

      {goalSuggestion && (
        <section className="connect-card" aria-label="頑張りたいことの提案">
          <p>これ、頑張りたいことにしておく？</p>
          <p className="person">{goalSuggestion}</p>
          <div className="connect-actions">
            <button
              type="button"
              onClick={() => {
                const text = goalSuggestion;
                setGoalSuggestion(null);
                void saveGoal({ action: "add", text }).then((ok) => ok && setNotice("頑張りたいことに残しました。「じぶん」で直したり消したりできます。"));
              }}
            >
              しておく
            </button>
            <button type="button" className="secondary" onClick={() => setGoalSuggestion(null)}>
              今はいい
            </button>
          </div>
        </section>
      )}

      {goalDone && (
        <section className="connect-card" aria-label="頑張りたいことができた">
          <p>「{goalDone.text}」、できたんだね！みんなに言っておく？</p>
          <div className="connect-actions">
            <button
              type="button"
              disabled={preparing}
              onClick={() => {
                const goal = goalDone;
                setGoalDone(null);
                void saveGoal({ action: "done", id: goal.id }).then((ok) => {
                  if (!ok) return;
                  setGoalForPost(goal);
                  void startCompose(askTarget ?? undefined, goal);
                });
              }}
            >
              みんなに言っておく
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const goal = goalDone;
                setGoalDone(null);
                void saveGoal({ action: "done", id: goal.id });
              }}
            >
              自分だけでいい
            </button>
            <button type="button" className="secondary" onClick={() => setGoalDone(null)}>
              まだ途中
            </button>
          </div>
        </section>
      )}

      {goalForPost && (
        <p className="sent" role="status">
          「{goalForPost.text}」、やったね！「{device ? "とどける" : "言葉にして送る"}」で、校内のみんなに伝えられます。
        </p>
      )}

      {safety && <SafetyCard key={safety.alertId} notice={safety} />}

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      {scripted && <p className="scripted">いまは台本で動いています（Claude にはつながっていません）</p>}

      {sentTo && (
        <p className="sent" role="status">
          {sentTo.channel.name}に届きました。<Link href={`/teams?channel=${sentTo.channel.id}`}>校内チャネルで見る</Link>
          <button type="button" className="undo" onClick={() => void undoSent()}>
            送ったものを取り消す
          </button>
        </p>
      )}

      {askTarget && (
        <p className="sent" role="status">
          {askTarget.name}さんに聞いてみましょう。話したら「{device ? "とどける" : "言葉にして送る"}」で、{askTarget.name}さんへのお願いになります。
          <button type="button" className="undo" onClick={() => setAskTarget(null)}>
            やめる
          </button>
        </p>
      )}

      {found && (
        <section className="chie-card" aria-label="校内の知恵">
          <h2>校内の知恵</h2>
          {found.length === 0 ? (
            <p>今は近いものが見つかりませんでした。</p>
          ) : (
            <KnowledgeResults
              results={found}
              viewerName={viewer.name}
              onAsk={(person) => {
                setAskTarget(person);
                setFound(null);
              }}
            />
          )}
        </section>
      )}
    </>
  );

  if (device) {
    return (
      <div className="talk device" data-viewer={viewer.name} data-state={listening ? "listening" : sending ? "thinking" : "idle"} data-talking={messages.length > 0 || listening}>
        {burst && <SendBurst words={burst} avatarImage={avatarImage} onDone={() => setBurst(null)} />}
        <section className="lcd" aria-label="相棒の画面">
          {companion && <div className="lcd-companion">{companion}</div>}
          <div className="log" role="log" aria-label="相棒との会話" ref={logRef} data-noswipe-landscape>
            {!acknowledged && (
              <section className="promise promise-card" aria-label="最初にお伝えすること">
                <p>{trial ? TRIAL_PROMISE_FULL : PROMISE_FULL}</p>
                <button
                  type="button"
                  onClick={() => {
                    rememberPromiseSeen();
                    setAcknowledged(true);
                  }}
                >
                  わかった
                </button>
              </section>
            )}
            {messages.length === 0 && !listening && question && <p className="daily-question">{question}</p>}
            {bubbleList}
            {sending && (
              <p className="bubble assistant waiting" role="status">
                考えています…
              </p>
            )}
            {cards}
            {attachment && (
              <section className="attachment-chip" aria-label="付けたファイル">
                <AttachmentPreview attachment={attachment} />
                <p>ひとこと話して、「とどける」を押してください。</p>
                <button type="button" className="undo" onClick={() => void removeAttachment()}>
                  外す
                </button>
              </section>
            )}
          </div>
          {acknowledged && <p className="promise promise-short">{trial ? TRIAL_PROMISE_SHORT : PROMISE_SHORT}</p>}
        </section>

        <form className="device-input" onSubmit={submit}>
          {listening ? (
            <p className="device-heard" role="status">
              <span className="listening-label">聞いています…</span>
              {draft && <span>{draft} </span>}
              {/* 新しく増えた文字だけが、ぼんやりから固まっていく */}
              {Array.from(heard).map((character, index) => (
                <span className="solidify" key={index}>
                  {character}
                </span>
              ))}
            </p>
          ) : (
            <textarea
              aria-label="相棒に書く"
              rows={2}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="話すか、ここに書く"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
          <button type="submit" disabled={listening || sending || draft.trim() === ""}>
            相棒に送る
          </button>
        </form>

        <div className="device-controls">
          <label className="device-side" data-busy={uploading}>
            <span className="device-side-face">
              <Icon name="attach" />
            </span>
            {uploading ? "付けています" : "写真"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading || listening}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
          </label>

          <ClickWheel
            onRotate={(degrees) => {
              if (logRef.current) logRef.current.scrollTop += degrees * WHEEL_PIXELS_PER_DEGREE;
            }}
          >
            <button
              type="button"
              className="device-mic"
              aria-pressed={listening}
              disabled={sending}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={() => {
                if (listening) {
                  pressedAt.current = null;
                  return;
                }
                pressedAt.current = Date.now();
                listen();
              }}
              onPointerUp={() => {
                const started = pressedAt.current;
                pressedAt.current = null;
                if (started === null || Date.now() - started >= HOLD_TO_TALK_MS) stopRef.current?.();
              }}
              onClick={(event) => {
                // キーボードで押したときは、押すたびに始める、止めるを切り替える
                if (event.detail !== 0) return;
                if (listening) stopRef.current?.();
                else listen();
              }}
            >
              <Icon name={listening ? "stop" : "talk"} />
              {listening ? "話し終わった" : "話しかける"}
            </button>
          </ClickWheel>

          <button
            type="button"
            className="device-side"
            disabled={!canCompose || listening || sending || preparing}
            onClick={() => void startCompose(askTarget ?? undefined)}
          >
            <span className="device-side-face">
              <Icon name="send" />
            </span>
            {preparing ? "作っています" : "とどける"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="talk" data-viewer={viewer.name}>
      {burst && <SendBurst words={burst} avatarImage={avatarImage} onDone={() => setBurst(null)} />}
      {avatarImage && (
        <div
          className="speaker"
          data-state={listening ? "listening" : sending ? "thinking" : "idle"}
          data-size={messages.length > 0 && !listening ? "small" : "large"}
        >
          <Avatar image={avatarImage} alt={`${viewer.name}さんの相棒`} size={176} />
        </div>
      )}
      <div className="log" role="log" aria-label="相棒との会話">
        {!acknowledged && (
          <section className="promise promise-card" aria-label="最初にお伝えすること">
            <p>{trial ? TRIAL_PROMISE_FULL : PROMISE_FULL}</p>
            <button
              type="button"
              onClick={() => {
                rememberPromiseSeen();
                setAcknowledged(true);
              }}
            >
              わかった
            </button>
          </section>
        )}
        {messages.length === 0 && !listening && (
          <>
            {question && <p className="daily-question">{question}</p>}
          </>
        )}
        {bubbleList}
        {listening && (
          <p className="bubble user listening" role="status">
            <span className="listening-label">聞いています…</span>
            {heard}
          </p>
        )}
        {sending && (
          <p className="bubble assistant waiting" role="status">
            考えています…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {cards}

      {!device && canCompose && !listening && (
        <button type="button" className="compose-start" disabled={sending || preparing} onClick={() => void startCompose(askTarget ?? undefined)}>
          <Icon name="send" />
          {preparing ? "言葉にしています…" : "言葉にして送る"}
        </button>
      )}

      {canCompose && !listening && !safety && (
        <button type="button" className="compose-start" disabled={sending || finding} onClick={() => void findKnowledge()}>
          <Icon name="idea" />
          {finding ? "探しています…" : "校内の知恵を探す"}
        </button>
      )}

      {acknowledged && <p className="promise promise-short">{trial ? TRIAL_PROMISE_SHORT : PROMISE_SHORT}</p>}

      <div className="side-actions">
      {attachment ? (
        <section className="attachment-chip" aria-label="付けたファイル">
          <AttachmentPreview attachment={attachment} />
          <p>ひとこと話して、「言葉にして送る」を押してください。</p>
          <button type="button" className="undo" onClick={() => void removeAttachment()}>
            外す
          </button>
        </section>
      ) : (
        !listening && (
          <label className="attach-button">
            <Icon name="attach" />
            {uploading ? "付けています…" : "写真か PDF を付ける"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void attach(file);
              }}
            />
          </label>
        )
      )}
      {!listening && (
        <Link className="walk-link" href="/walk">
          <Icon name="walk" />
          歩きながら話す
        </Link>
      )}
      </div>

      <div className="actions">
        {listening ? (
          <button type="button" className="primary stop" onClick={() => stopRef.current?.()}>
            <Icon name="stop" />
            話し終わった
          </button>
        ) : (
          <>
            <button type="button" className="primary" onClick={listen} disabled={sending}>
              <Icon name="talk" />
              話しかける
            </button>
            <button
              type="button"
              className="primary"
              aria-expanded={writing}
              onClick={() => setWriting((value) => !value)}
            >
              <Icon name="write" />
              文字で書く
            </button>
          </>
        )}
      </div>

      {writing && !listening && (
        <form className="write" onSubmit={submit}>
          <textarea
            aria-label="相棒に書く"
            rows={2}
            maxLength={MAX_TEXT_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={sending || draft.trim() === ""}>
            相棒に送る
          </button>
        </form>
      )}
    </div>
  );
}
