"use client";

import Link from "next/link";
import { useState } from "react";
import type { HiddenPerson, NakamaSuggestion } from "@/lib/nakama";

type Found = { suggestions: NakamaSuggestion[]; needsWords: boolean; mode: "real" | "scripted" };

export function NakamaFinder({ hidden: firstHidden }: { hidden: HiddenPerson[] }) {
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [hidden, setHidden] = useState(firstHidden);

  async function find() {
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/nakama", { method: "POST" });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setFound((await response.json()) as Found);
    } catch {
      setProblem("探せませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  async function showAgain(personId: string) {
    setProblem("");
    const response = await fetch("/api/nakama/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, hidden: false }),
    }).catch(() => null);
    if (response?.ok) setHidden((current) => current.filter((person) => person.id !== personId));
    else setProblem("戻せませんでした。もう一度押してください。");
  }

  return (
    <>
      <section className="card nakama" aria-label="仲間を探す">
        <button type="button" disabled={busy} onClick={() => void find()}>
          {busy ? "探しています…" : "仲間を探す"}
        </button>
        {problem && (
          <p className="notice" role="alert">
            {problem}
          </p>
        )}
        {found?.mode === "scripted" && <p className="muted">いまは台本で動いています。</p>}
        {found?.needsWords && <p>校内に投稿するかプロフィールを公開すると、探せるようになります。</p>}
        {found && !found.needsWords && found.suggestions.length === 0 && <p>今は近い人が見つかりませんでした。</p>}
        {found && found.suggestions.length > 0 && (
          <ul>
            {found.suggestions.map((person) => (
              <li key={person.personId}>
                <Link href={`/people/${person.personId}`}>
                  <strong>{person.name}</strong>（{person.label}）
                </Link>
                <p>{person.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="card nakama" aria-label="しばらく出していない人">
          <h2>しばらく出していない人</h2>
          <p className="muted">この一覧はあなたにしか見えません。相手にも伝わりません。</p>
          <ul>
            {hidden.map((person) => (
              <li key={person.id}>
                {person.name}（{person.label}）{" "}
                <button type="button" className="secondary" onClick={() => void showAgain(person.id)}>
                  また出す
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
