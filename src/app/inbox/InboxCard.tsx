"use client";

import Link from "next/link";
import { useState } from "react";
import type { InboxItem, PassCandidate } from "@/lib/inbox";
import { VoiceReply, type VoiceReplyRestore } from "../VoiceReply";
import { cardAttr, PostSubject } from "@/app/PostSubject";

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

  const [passWords, setPassWords] = useState("");
  // つなぐ欄の開き具合。送れなかったときは開いたまま戻す
  const [passOpen, setPassOpen] = useState(false);
  // 送れなかった返信は、確かめた言葉のまま戻す（0-2l(2)）
  const [replyRestore, setReplyRestore] = useState<{ key: number; value: VoiceReplyRestore } | null>(null);

  /** 相手を選んだら、パートナーが「〇〇さん、どうですか？」の下書きを作る。送るのは本人が確かめてから。 */
  async function choose(personId: string) {
    setPassTo(personId);
    setPassWords("");
    setNotice("");
    if (personId === "") return;
    setBusy(true);
    try {
      const { ok, data } = await postJson("/api/inbox/pass-draft", { postId: item.postId, toPersonId: personId });
      if (!ok || typeof data.text !== "string") throw new Error("draft failed");
      setPassWords(data.text);
    } catch {
      setNotice("下書きを作れませんでした。自分の言葉で書いて送れます。");
    } finally {
      setBusy(false);
    }
  }

  // 0-2l(2)：押した瞬間に「つなぎました」にし、送信は裏で進める。失敗したときだけ、選んだ相手と言葉を残して戻す
  async function pass() {
    setNotice("");
    setDone("passed");
    try {
      const { ok, status } = await postJson("/api/inbox/pass", { postId: item.postId, toPersonId: passTo, text: passWords });
      if (status === 422) {
        setDone(null);
        setNotice("この言葉では送れません。言い方を変えてください。");
        return;
      }
      if (!ok) throw new Error("pass failed");
    } catch {
      setDone(null);
      setNotice("まだつなげていません。言葉は残してあるので、もう一度押してください。");
    }
  }

  if (done) {
    return (
      <section className="talk inbox-item" aria-label={`${item.authorName}さんからのお願い`} role="status">
        <p>{done === "replied" ? "返信が届きました。解決！" : "つなぎました。つないでくれてありがとう。"}</p>
        <Link href={`/teams?channel=${item.channelId}`}>校内チャネルで見る</Link>
      </section>
    );
  }


  return (
    <section
      className="talk inbox-item"
      {...cardAttr(item.subject)}
      aria-label={cardAttr(item.subject)["data-card"] ? `${item.authorName}さんからのカード` : `${item.authorName}さんからのお願い`}
    >
      {item.passedThrough.length > 0 && <p className="passed">{item.passedThrough.join("さん → ")}さんからのパス</p>}
      <p className="from">
        <strong>{item.authorName}</strong>（{item.authorLabel}）・{item.channelName}
      </p>
      <PostSubject subject={item.subject} />
      <p>{item.body}</p>

      <VoiceReply
        postId={item.postId}
        draftUrl="/api/inbox/draft"
        replyUrl="/api/inbox/reply"
        disabled={busy}
        onBusyChange={setBusy}
        key={replyRestore?.key ?? 0}
        restore={replyRestore?.value}
        onSent={() => {
          setNotice("");
          setDone("replied");
        }}
        onFailed={(value, message) => {
          setReplyRestore((current) => ({ key: (current?.key ?? 0) + 1, value }));
          setDone(null);
          setNotice(message);
        }}
      />

      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      {candidates.length > 0 && (
        <details open={passOpen} onToggle={(event) => setPassOpen(event.currentTarget.open)}>
          <summary>もっと詳しい人につなぐ</summary>
          <div className="pass">
            <label>
              つなぐ相手
              <select value={passTo} disabled={busy} onChange={(event) => void choose(event.target.value)}>
                <option value="">選んでください</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}（{candidate.label}）
                  </option>
                ))}
              </select>
            </label>
            {passTo !== "" && (
              <label>
                元の投稿への返事（相手に @ で届きます）
                <textarea value={passWords} rows={3} maxLength={2000} onChange={(event) => setPassWords(event.target.value)} />
              </label>
            )}
            <button type="button" disabled={busy || passTo === "" || passWords.trim() === ""} onClick={() => void pass()}>
              つなぐ
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
