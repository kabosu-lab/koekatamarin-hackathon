"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function KnowledgeNew({ postId }: { postId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [existing, setExisting] = useState<string | null>(null);

  async function post(url: string, payload: Record<string, unknown>) {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setProblem(typeof body.error === "string" ? body.error : "できませんでした。もう一度押してください。");
        if (typeof body.itemId === "string") setExisting(body.itemId);
        return null;
      }
      return body;
    } catch {
      setProblem("つながりませんでした。もう一度押してください。");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function makeDraft() {
    const body = await post("/api/chie/draft", { postId });
    if (body) setDraft(body.draft as { title: string; body: string });
  }

  async function create() {
    if (!draft) return;
    const body = await post("/api/chie", { postId, ...draft });
    if (body) router.push(`/chie/${body.itemId as string}`);
  }

  return (
    <section className="card" aria-label="知恵の下書き">
      {!draft ? (
        <button type="button" disabled={busy} onClick={() => void makeDraft()}>
          {busy ? "下書きを作っています…" : "相棒に下書きを作ってもらう"}
        </button>
      ) : (
        <div className="chie-form">
          <label htmlFor="chie-title">題</label>
          <input id="chie-title" value={draft.title} maxLength={60} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <label htmlFor="chie-text">本文</label>
          <textarea id="chie-text" rows={6} maxLength={2000} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          <p className="muted">やり取りに書かれていないことは足されていないか、確かめてください。言葉を使われた全員が確認すると、校内に広がります。</p>
          <button type="button" disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={() => void create()}>
            本人たちに確認してもらう
          </button>
        </div>
      )}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {existing && <Link href={`/chie/${existing}`}>できている知恵を見る</Link>}
    </section>
  );
}
