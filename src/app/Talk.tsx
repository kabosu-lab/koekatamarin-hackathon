"use client";

import Link from "next/link";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { ChatMessage } from "@/lib/claude/types";
import type { ChannelView, PersonView } from "@/lib/destination/types";
import type { KnowledgeResult } from "@/lib/knowledge";
import { PROMISE_FULL, PROMISE_SHORT, promiseCookieName } from "@/lib/promise-cookie";
import { KnowledgeResults } from "./chie/KnowledgeResults";
import { Compose, type ComposeStart } from "./Compose";
import { ConnectCard, type ConnectSuggestion } from "./ConnectCard";
import { SafetyCard, type SafetyNotice } from "./SafetyCard";
import { AttachmentPreview } from "./AttachmentPreview";
import { playSendSound, SendBurst } from "./SendBurst";
import type { AttachmentView } from "@/lib/attachment";
import { loadTalk, saveTalk } from "./talk-storage";
import { isSpeechSupported, startListening } from "./speech";

const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY = 40;
/** 話の途中で声をかけないよう、少なくとも2往復してから確かめる */
const CONNECT_MIN_MESSAGES = 4;

export function Talk({
  viewer,
  question,
  initialAsk = null,
  viewerId,
  promiseSeen = false,
}: {
  viewer: { name: string; label: string };
  question: string | null;
  initialAsk?: { id: string; name: string } | null;
  viewerId: string;
  promiseSeen?: boolean;
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
  const [acknowledged, setAcknowledged] = useState(promiseSeen);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<KnowledgeResult[] | null>(null);
  const connectDone = useRef(false);
  const [sentTo, setSentTo] = useState<{ channel: ChannelView; postId: string; isPublic: boolean } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, sending, heard]);

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
    if (saved.length > 0) setMessages(saved);
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

  async function startCompose(asked?: { id: string; name: string }) {
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
      setComposing({ draft, review, channels, people, asked, attachment: checked });
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
      onFinal: (text) => void send(text),
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
            setAttachment(null);
            setBurst(words);
            playSendSound(words);
          }}
        />
      </div>
    );
  }

  const canCompose = messages.some((message) => message.role === "user");

  return (
    <div className="talk" data-viewer={viewer.name}>
      {burst && <SendBurst words={burst} onDone={() => setBurst(null)} />}
      <div className="log" role="log" aria-label="相棒との会話">
        {!acknowledged && (
          <section className="promise promise-card" aria-label="最初にお伝えすること">
            <p>{PROMISE_FULL}</p>
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
            <p className="hint">今日の頑張りでも、調べ物でも、困りごとでも。思いついたことから、どうぞ。</p>
          </>
        )}
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

      {suggestion && (
        <ConnectCard
          suggestion={suggestion}
          busy={preparing}
          onAccept={() => void startCompose({ id: suggestion.personId, name: suggestion.name })}
          onDecline={() => setSuggestion(null)}
        />
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
          {sentTo.isPublic && <Link href="/nakama">同じことに取り組んでいる人を探してみる？</Link>}
        </p>
      )}

      {askTarget && (
        <p className="sent" role="status">
          {askTarget.name}さんに聞いてみましょう。話したら「言葉にして送る」で、{askTarget.name}さんへのお願いになります。
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

      {canCompose && !listening && (
        <button type="button" className="compose-start" disabled={sending || preparing} onClick={() => void startCompose(askTarget ?? undefined)}>
          {preparing ? "言葉にしています…" : "言葉にして送る"}
        </button>
      )}

      {canCompose && !listening && !safety && (
        <button type="button" className="compose-start" disabled={sending || finding} onClick={() => void findKnowledge()}>
          {finding ? "探しています…" : "校内の知恵を探す"}
        </button>
      )}

      {acknowledged && <p className="promise promise-short">{PROMISE_SHORT}</p>}

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

      <div className="actions">
        {listening ? (
          <button type="button" className="primary stop" onClick={() => stopRef.current?.()}>
            話し終わった
          </button>
        ) : (
          <>
            <button type="button" className="primary" onClick={listen} disabled={sending}>
              話しかける
            </button>
            <button
              type="button"
              className="primary"
              aria-expanded={writing}
              onClick={() => setWriting((value) => !value)}
            >
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
