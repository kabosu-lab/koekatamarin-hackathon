"use client";

import Link from "next/link";
import { useState } from "react";
import type { InboxItem, PassCandidate } from "@/lib/inbox";
import { VoiceReply } from "../VoiceReply";

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
  const [passTo, setPassTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState<"replied" | "passed" | null>(null);

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


  return (
    <section className="talk inbox-item" aria-label={`${item.authorName}さんからのお願い`}>
      {item.passedThrough.length > 0 && <p className="passed">{item.passedThrough.join("さん → ")}さんからのパス</p>}
      <p className="from">
        <strong>{item.authorName}</strong>（{item.authorLabel}）・{item.channelName}
      </p>
      <p>{item.body}</p>

      <VoiceReply
        postId={item.postId}
        draftUrl="/api/inbox/draft"
        replyUrl="/api/inbox/reply"
        disabled={busy}
        onBusyChange={setBusy}
        onSent={() => setDone("replied")}
      />

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
