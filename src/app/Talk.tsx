"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/claude/types";
import { isSpeechSupported, startListening } from "./speech";

const MAX_TEXT_LENGTH = 2000;
const MAX_HISTORY = 40;

export function Talk() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [scripted, setScripted] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, sending, heard]);

  useEffect(() => () => stopRef.current?.(), []);

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
      if (!response.ok) throw new Error(`status ${response.status}`);
      const { reply, mode } = (await response.json()) as { reply: string; mode: string };
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      setScripted(mode === "scripted");
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

  return (
    <div className="talk">
      <div className="log" role="log" aria-label="相棒との会話">
        {messages.length === 0 && !listening && (
          <p className="hint">調べ物でも、悩みでも、今日の頑張りでも。思いついたことから、どうぞ。</p>
        )}
        {messages.map((message, index) => (
          <p key={index} className={`bubble ${message.role}`}>
            <span className="visually-hidden">{message.role === "user" ? "あなた：" : "相棒："}</span>
            {message.content}
          </p>
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

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
      {scripted && <p className="scripted">いまは台本で動いています（Claude にはつながっていません）</p>}

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
            送る
          </button>
        </form>
      )}
    </div>
  );
}
