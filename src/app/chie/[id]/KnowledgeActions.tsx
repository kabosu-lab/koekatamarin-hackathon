"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KnowledgeDetail, KnowledgeReview } from "@/lib/knowledge";

function ReviewItem({
  review,
  canResolve,
  canThank,
  run,
}: {
  review: KnowledgeReview;
  canResolve: boolean;
  canThank: boolean;
  run(payload: Record<string, unknown>, url?: string): Promise<boolean>;
}) {
  const [thanked, setThanked] = useState(false);
  return (
    <li>
      <strong>{review.reviewerName}さん</strong>：{review.verdict === "helped" ? "試して役に立った" : "直したほうがいい"}
      {review.resolved && "（解決しました）"}
      {review.comment && <p className="chie-body">{review.comment}</p>}
      <p className="chie-links">
        {canResolve && review.verdict === "fix" && !review.resolved && (
          <button type="button" className="secondary" onClick={() => void run({ action: "resolve", reviewId: review.id })}>
            直したので解決にする
          </button>
        )}
        {canThank &&
          (thanked ? (
            <span role="status">ありがとうを送りました</span>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void run(
                  { toPersonId: review.reviewerId, message: "知恵を見てくれて、ありがとうございます！" },
                  "/api/thanks",
                ).then((ok) => setThanked(ok))
              }
            >
              ありがとうを送る
            </button>
          ))}
      </p>
    </li>
  );
}

/** 確認、直し、レビュー。AI は評価を付けず、判断はすべて人がする。 */
export function KnowledgeActions({ item, viewerId }: { item: KnowledgeDetail; viewerId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");

  async function run(payload: Record<string, unknown>, url = "/api/chie/action"): Promise<boolean> {
    setBusy(true);
    setProblem("");
    setDone("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(url === "/api/chie/action" ? { itemId: item.id, ...payload } : payload),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; reconfirm?: boolean };
      if (!response.ok) {
        setProblem(result.error ?? "できませんでした。もう一度押してください。");
        return false;
      }
      if (result.reconfirm) setDone("大きく直したので、本人たちの確認に戻しました。");
      router.refresh();
      return true;
    } catch {
      setProblem("つながりませんでした。もう一度押してください。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const removable = !item.isAuthor && item.status !== "withdrawn" && (item.viewerState === "ok" || item.viewerState === "waiting");

  return (
    <>
      {item.viewerState === "waiting" && item.status === "confirming" && !item.fixRequested && (
        <section className="card" aria-label="あなたの確認">
          <h2>あなたの言葉が入っています</h2>
          <p>このまま校内に広げてよいですか？</p>
          <button type="button" disabled={busy} onClick={() => void run({ action: "confirm" })}>
            これでいいよ
          </button>
        </section>
      )}

      {removable && (
        <section className="card" aria-label="名前と言葉を外す">
          <p className="muted">いつでも外せます。外すと、作った人が直すまで広がりません。</p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run({ action: "remove" })}>
            名前と言葉を外す
          </button>
        </section>
      )}

      {item.isAuthor && item.status !== "withdrawn" && (
        <section className="card chie-form" aria-label="知恵を直す">
          <h2>直す</h2>
          {item.fixRequested && <p className="notice">外してほしいという人がいます。その人の言葉を本文から直してください。</p>}
          <label htmlFor="chie-edit-title">題</label>
          <input id="chie-edit-title" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />
          <label htmlFor="chie-edit-body">本文</label>
          <textarea id="chie-edit-body" rows={5} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} />
          <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => void run({ action: "edit", title, body })}>
            直して保存する
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run({ action: "withdraw" })}>
            取り下げる
          </button>
        </section>
      )}

      {item.canReview && (
        <section className="card chie-form" aria-label="レビューする">
          <h2>試してみましたか？</h2>
          <button type="button" disabled={busy} onClick={() => void run({ action: "review", verdict: "helped", comment }).then((ok) => ok && setComment(""))}>
            試して役に立った
          </button>
          <label htmlFor="chie-comment">一言（直したほうがいいときは必須）</label>
          <textarea id="chie-comment" rows={2} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} />
          <button
            type="button"
            className="secondary"
            disabled={busy || !comment.trim()}
            onClick={() => void run({ action: "review", verdict: "fix", comment }).then((ok) => ok && setComment(""))}
          >
            直したほうがいい
          </button>
        </section>
      )}

      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {done && <p role="status">{done}</p>}

      {item.reviews.length > 0 && (
        <section className="card" aria-label="みんなのレビュー">
          <h2>みんなのレビュー</h2>
          <ul className="chie-list">
            {item.reviews.map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                canResolve={item.isAuthor}
                canThank={review.reviewerId !== viewerId && (item.isAuthor || item.viewerState === "ok")}
                run={run}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
