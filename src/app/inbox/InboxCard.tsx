"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Review } from "@/lib/claude/compose";
import type { InboxItem, PassCandidate, ReplyDraft } from "@/lib/inbox";
import { isSpeechSupported, startListening } from "../speech";

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

export function InboxCard({ item, candidates }: { item: InboxItem; candidates: PassCandidate[] }) {
  const [spoken, setSpoken] = useState("");
  const [listening, setListening] = useState(false);
  const [question, setQuestion] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewedText, setReviewedText] = useState("");
  const [passTo, setPassTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState<"replied" | "passed" | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

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
      const { ok, data } = await postJson("/api/inbox/draft", { postId: item.postId, spoken });
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
      const { ok, status, data } = await postJson("/api/inbox/reply", { postId: item.postId, text });
      if (ok) {
        setDone("replied");
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

  async function pass() {
    setBusy(true);
    setNotice("");
    try {
      const { ok } = await postJson("/api/inbox/pass", { postId: item.postId, toPersonId: passTo });
      if (!ok) throw new Error("pass failed");
      setDone("passed");
    } catch {
      setNotice("パスできませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="talk inbox-item" aria-label={`${item.authorName}さんからのお願い`} role="status">
        <p>{done === "replied" ? "返信が届きました。ゴール！" : "パスしました。つないでくれてありがとう。"}</p>
        <Link href={`/teams?channel=${item.channelId}`}>校内チャネルで見る</Link>
      </section>
    );
  }

  const checked = text !== null && text.trim() === reviewedText.trim();
  const blocked = checked && review?.verdict === "block";

  return (
    <section className="talk inbox-item" aria-label={`${item.authorName}さんからのお願い`}>
      {item.passedThrough.length > 0 && <p className="passed">{item.passedThrough.join("さん → ")}さんからのパス</p>}
      <p className="from">
        <strong>{item.authorName}</strong>（{item.authorLabel}）・{item.channelName}
      </p>
      <p>{item.body}</p>

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
              <button type="button" disabled={busy} onClick={listen}>
                話して返す
              </button>
            )}
            <button type="button" disabled={busy || listening || spoken.trim() === ""} onClick={() => void makeReply()}>
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
                  disabled={busy}
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
            <button type="button" disabled={busy || text.trim() === ""} onClick={() => void check(text)}>
              受け取られ方を確かめる
            </button>
          )}
          <div className="row">
            <button type="button" disabled={busy} onClick={() => setText(null)}>
              話し直す
            </button>
            <button type="button" disabled={busy || !checked || blocked} onClick={() => void send()}>
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

      {candidates.length > 0 && (
        <details>
          <summary>もっと詳しい人にパスする</summary>
          <div className="pass">
            <label>
              パスする相手
              <select value={passTo} onChange={(event) => setPassTo(event.target.value)}>
                <option value="">選んでください</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}（{candidate.label}）
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy || passTo === ""} onClick={() => void pass()}>
              パスする
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
