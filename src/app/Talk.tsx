"use client";

import Link from "next/link";
import { type FormEvent, Fragment, useEffect, useRef, useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { ChatMessage } from "@/lib/claude/types";
import type { ChannelView, PersonView } from "@/lib/destination/types";
import { Compose, type ComposeStart } from "./Compose";
import { ConnectCard, type ConnectSuggestion } from "./ConnectCard";
import { SafetyCard, type SafetyNotice } from "./SafetyCard";
import { playSendSound, SendBurst } from "./SendBurst";
import { loadTalk, saveTalk } from "./talk-storage";
import { isSpeechSupported, startListening } from "./speech";

const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY = 40;
/** 話の途中で声をかけないよう、少なくとも2往復してから確かめる */
const CONNECT_MIN_MESSAGES = 4;

export function Talk({
  viewer,
  question,
}: {
  viewer: { name: string; label: string };
  question: string | null;
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
  const [remembered, setRemembered] = useState<number[]>([]);
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

  async function send(raw: string) {
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
        body: JSON.stringify({ history: messages.slice(-MAX_HISTORY), askedPersonId: asked?.id }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const { draft, review, channels, people } = (await response.json()) as {
        draft: Draft;
        review: Review | null;
        channels: ChannelView[];
        people: PersonView[];
      };
      if (!draft.ready || !review) {
        setNotice("まだ投稿にできるお話がなさそう。もう少し聞かせてください。");
        return;
      }
      setSuggestion(null);
      setComposing({ draft, review, channels, people, asked });
    } catch {
      setNotice("下書きを作れませんでした。もう一度押してください。");
    } finally {
      setPreparing(false);
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
          onSent={(channel, postId, words, isPublic) => {
            setComposing(null);
            setSentTo({ channel, postId, isPublic });
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
        <p className="promise">ここでの話はあなただけのものです。ただし、命や安全に関わるときは、話した言葉ではなく要点だけを相談室の先生に伝えます。</p>
        {messages.length === 0 && !listening && (
          <>
            {question && <p className="daily-question">{question}</p>}
            <p className="hint">調べ物でも、悩みでも、今日の頑張りでも。思いついたことから、どうぞ。</p>
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

      {canCompose && !listening && (
        <button type="button" className="compose-start" disabled={sending || preparing} onClick={() => void startCompose()}>
          {preparing ? "言葉にしています…" : "言葉にして送る"}
        </button>
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
