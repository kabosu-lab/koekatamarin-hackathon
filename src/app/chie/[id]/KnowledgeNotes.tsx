"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KnowledgeDetail, KnowledgeNote } from "@/lib/knowledge";

/** 注釈。書いた人以外の2人が「役に立つ」とすると、知恵の下に出る。押した人数は見せない。 */
export function KnowledgeNotes({ item, viewerId }: { item: KnowledgeDetail; viewerId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function run(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/chie/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, ...payload }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setProblem(result.error ?? "できませんでした。もう一度押してください。");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setProblem("つながりませんでした。もう一度押してください。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function Note({ note }: { note: KnowledgeNote }) {
    const mine = note.authorId === viewerId;
    return (
      <li className="chie-note">
        <p className="chie-body">{note.body}</p>
        <p className="muted">
          {note.authorName}さんの注釈{!note.shown && "・まだ確かめ中"}
        </p>
        <p className="chie-links">
          {mine ? (
            <button type="button" className="secondary" disabled={busy} onClick={() => void run({ action: "delete_note", noteId: note.id })}>
              注釈を消す
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              aria-pressed={note.votedByViewer}
              disabled={busy}
              onClick={() => void run({ action: "vote_note", noteId: note.id, helpful: !note.votedByViewer })}
            >
              {note.votedByViewer ? "役に立つを取り消す" : "役に立つ"}
            </button>
          )}
        </p>
      </li>
    );
  }

  const shown = item.notes.filter((note) => note.shown);
  const myPending = item.notes.filter((note) => !note.shown && note.authorId === viewerId);
  const othersPending = item.notes.filter((note) => !note.shown && note.authorId !== viewerId);

  return (
    <section className="card chie-form" aria-label="注釈">
      <h2>注釈</h2>
      {shown.length + myPending.length > 0 && (
        <ul className="chie-list">
          {[...shown, ...myPending].map((note) => (
            <Note key={note.id} note={note} />
          ))}
        </ul>
      )}
      {othersPending.length > 0 && (
        <details>
          <summary>注釈を見る（まだ確かめ中のもの）</summary>
          <ul className="chie-list">
            {othersPending.map((note) => (
              <Note key={note.id} note={note} />
            ))}
          </ul>
        </details>
      )}
      <label htmlFor="chie-note">注釈を書く（補足、前提、古くなった点など）</label>
      <textarea id="chie-note" rows={2} maxLength={500} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <p className="muted">書いた人以外の2人が「役に立つ」と押すと、知恵の下に出ます。</p>
      <button
        type="button"
        className="secondary"
        disabled={busy || !draft.trim()}
        onClick={() => void run({ action: "note", body: draft }).then((ok) => ok && setDraft(""))}
      >
        注釈を出す
      </button>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
