"use client";

import { useEffect, useRef, useState } from "react";
import type { StudyPresence, StudySession } from "@/lib/study";
import { PresenceView } from "./PresenceView";

const STUDY_CHANNEL = "study";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Props = {
  initialSession: StudySession | null;
  initialPresence: StudyPresence;
  initialLateNight: boolean;
};

export function StudyTimer({ initialSession, initialPresence, initialLateNight }: Props) {
  const [session, setSession] = useState(initialSession);
  const [presence, setPresence] = useState(initialPresence);
  const [left, setLeft] = useState<number | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [lateNight, setLateNight] = useState(initialLateNight);
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const finishing = useRef(false);

  async function finish(sessionId: string) {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/study", { action: "finish", sessionId });
      if (!ok) throw new Error("finish failed");
      setSession(null);
      setLeft(null);
      setQuestion(data.question as string);
      setLateNight(data.lateNight === true);
      setPresence(data.presence as StudyPresence);
    } catch {
      setNotice("うまくいきませんでした。もう一度押してください。");
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }

  const sessionId = session?.id;
  const remainingMs = session?.remainingMs;
  useEffect(() => {
    if (!sessionId || remainingMs === undefined) return;
    const deadline = Date.now() + remainingMs;
    const tick = () => {
      const remaining = deadline - Date.now();
      setLeft(remaining);
      if (remaining <= 0) void finish(sessionId);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // finish は ref で二重実行を防いでいるので、依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, remainingMs]);

  async function start() {
    setBusy(true);
    setNotice("");
    setQuestion(null);
    try {
      const { ok, data } = await postJson("/api/study", { action: "start" });
      if (!ok) throw new Error("start failed");
      setSession(data.session as StudySession);
      setPresence(data.presence as StudyPresence);
    } catch {
      setNotice("うまくいきませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/publish", { text: words, channelId: STUDY_CHANNEL, kind: "effort" });
      if (ok) {
        setQuestion(null);
        setWords("");
        setNotice("校内チャネルに届きました。");
      } else {
        setNotice(typeof data.error === "string" ? data.error : "まだ送っていません。もう一度押してください。");
      }
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" aria-label="自習室">
        <PresenceView presence={presence} />
      </section>

      <section className="card" aria-label="タイマー">
        {session ? (
          <>
            <p className="timer" role="timer">
              {left === null ? "25:00" : format(left)}
            </p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void finish(session.id)}>
              ここまでにする
            </button>
          </>
        ) : question ? (
          <>
            <h2>{question}</h2>
            <label>
              やったこと（投稿するかは自分で選べます）
              <textarea rows={2} maxLength={2000} value={words} onChange={(event) => setWords(event.target.value)} />
            </label>
            <div className="row">
              <button type="button" disabled={busy || words.trim() === ""} onClick={() => void share()}>
                投稿する
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setQuestion(null)}>
                投稿しない
              </button>
            </div>
          </>
        ) : lateNight ? (
          <>
            <p>もう遅い時間です。今日はここまでにして、休みませんか。</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void start()}>
              それでも25分だけやる
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => void start()}>
            25分はじめる
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
    </>
  );
}
