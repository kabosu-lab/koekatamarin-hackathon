"use client";

import { useEffect, useRef, useState } from "react";
import type { Review } from "@/lib/claude/compose";
import type { ReplyDraft } from "@/lib/inbox";
import { playReachedSound } from "./sound";
import { isSpeechSupported, startListening } from "./speech";

const MAX_LENGTH = 2000;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

/**
 * 話して返す部品。声か文字で話すと下書きになり、受け取られ方を確かめて、本人が送る。
 * AI は経験を足さず、中身がなければ聞き返す（`draftReply`）。
 */
export function VoiceReply({
  postId,
  draftUrl,
  replyUrl,
  listenLabel = "話して返す",
  disabled = false,
  onBusyChange,
  onSent,
}: {
  postId: string;
  draftUrl: string;
  replyUrl: string;
  listenLabel?: string;
  disabled?: boolean;
  onBusyChange?(busy: boolean): void;
  onSent(): void;
}) {
  const [spoken, setSpoken] = useState("");
  const [listening, setListening] = useState(false);
  const [question, setQuestion] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewedText, setReviewedText] = useState("");
  const [busy, setBusyState] = useState(false);
  const [notice, setNotice] = useState("");
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  function setBusy(value: boolean) {
    setBusyState(value);
    onBusyChange?.(value);
  }

  function listen() {
    setNotice("");
    if (!isSpeechSupported()) {
      setNotice("このブラウザでは声が使えません。文字で書いてください。");
      return;
    }
    const before = spoken;
    setListening(true);
    stopRef.current = startListening({
      onInterim: (heard) => setSpoken(before ? `${before}\n${heard}` : heard),
      onFinal: (heard) => setSpoken(before ? `${before}\n${heard}` : heard),
      onError: setNotice,
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
      },
    });
  }

  async function makeReply() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson(draftUrl, { postId, spoken });
      if (!ok) throw new Error("draft failed");
      const draft = data.draft as ReplyDraft;
      if (draft.kind === "ask_back") {
        setQuestion(draft.question);
        return;
      }
      setQuestion("");
      setText(draft.text);
      setReview(data.review as Review);
      setReviewedText(draft.text);
    } catch {
      setNotice("言葉にできませんでした。話した言葉は残してあります。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function check(target: string) {
    setBusy(true);
    setNotice("");
    try {
      const { ok, data } = await postJson("/api/review", { text: target });
      if (!ok) throw new Error("review failed");
      setReview(data.review as Review);
      setReviewedText(target);
    } catch {
      setNotice("確かめられませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setNotice("");
    try {
      const { ok, status, data } = await postJson(replyUrl, { postId, text });
      if (ok) {
        playReachedSound();
        onSent();
        return;
      }
      if (status === 422 && data.review) {
        setReview(data.review as Review);
        setReviewedText(text ?? "");
        return;
      }
      setNotice("まだ送っていません。もう一度押してください。");
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  const checked = text !== null && text.trim() === reviewedText.trim();
  const blocked = checked && review?.verdict === "block";
  const locked = busy || disabled;

  return (
    <>
      {text === null ? (
        <>
          <label>
            <span className="visually-hidden">話したこと</span>
            <textarea
              aria-label="話したこと"
              rows={3}
              maxLength={MAX_LENGTH}
              placeholder="話すか、書いてください"
              value={spoken}
              onChange={(event) => setSpoken(event.target.value)}
            />
          </label>
          {question && (
            <p className="question" role="status">
              {question}
            </p>
          )}
          <div className="row">
            {listening ? (
              <button type="button" onClick={() => stopRef.current?.()}>
                話し終わった
              </button>
            ) : (
              <button type="button" disabled={locked} onClick={listen}>
                {listenLabel}
              </button>
            )}
            <button type="button" disabled={locked || listening || spoken.trim() === ""} onClick={() => void makeReply()}>
              返信の言葉にする
            </button>
          </div>
        </>
      ) : (
        <div className="compose-card">
          <textarea
            aria-label="返信の文章"
            rows={3}
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {checked && review ? (
            <div className={`perception ${review.verdict}`} role="status">
              <p>{review.perception}</p>
              {review.alternatives.map((alternative) => (
                <button
                  type="button"
                  className="alternative"
                  key={alternative}
                  disabled={locked}
                  onClick={() => {
                    setText(alternative);
                    void check(alternative);
                  }}
                >
                  この言い方にする：{alternative}
                </button>
              ))}
            </div>
          ) : (
            <button type="button" disabled={locked || text.trim() === ""} onClick={() => void check(text)}>
              受け取られ方を確かめる
            </button>
          )}
          <div className="row">
            <button type="button" disabled={locked} onClick={() => setText(null)}>
              話し直す
            </button>
            <button type="button" disabled={locked || !checked || blocked} onClick={() => void send()}>
              本人として返信する
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}
    </>
  );
}
