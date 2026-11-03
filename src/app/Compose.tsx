"use client";

import { useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { ChannelView } from "@/lib/destination/types";

export type ComposeStart = {
  draft: Draft;
  review: Review;
  channels: ChannelView[];
};

type Props = ComposeStart & {
  viewer: { name: string; label: string };
  onCancel(): void;
  onSent(channel: ChannelView): void;
};

const MAX_LENGTH = 2000;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: (await response.json()) as Record<string, unknown> };
}

export function Compose({ draft, review: firstReview, channels, viewer, onCancel, onSent }: Props) {
  const [text, setText] = useState(draft.text);
  const [channelId, setChannelId] = useState(draft.channelId);
  const [review, setReview] = useState(firstReview);
  const [reviewedText, setReviewedText] = useState(draft.text);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const checked = text.trim() === reviewedText.trim();
  const blocked = checked && review.verdict === "block";

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
      const { ok, status, data } = await postJson("/api/publish", {
        text,
        channelId,
        kind: draft.kind,
        researchedWithAi: draft.researchedWithAi,
      });
      if (ok) {
        onSent(channel);
        return;
      }
      if (status === 422 && data.review) {
        setReview(data.review as Review);
        setReviewedText(text);
        return;
      }
      setNotice("まだ送っていません。もう一度押してください。");
    } catch {
      setNotice("まだ送っていません。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="compose-card" aria-label="言葉にして送る">
      <h2>こんな言葉でどうかな？</h2>
      <textarea
        aria-label="投稿の文章"
        rows={4}
        maxLength={MAX_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      {checked ? (
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

      <label className="channel">
        送り先のチャネル
        <select value={channelId} onChange={(event) => setChannelId(event.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="preview">
        <p className="preview-title">Teams にはこう見えます（{channel.name}）</p>
        <p className="preview-author">
          <strong>{viewer.name}</strong> {viewer.label}
        </p>
        <p className="preview-body">{text}</p>
        {draft.researchedWithAi && <p className="preview-mark">AI と調べました</p>}
      </div>

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      <div className="compose-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          取り消す
        </button>
        <button type="button" disabled={busy || !checked || blocked} onClick={() => void send()}>
          本人として送る
        </button>
      </div>
    </section>
  );
}
