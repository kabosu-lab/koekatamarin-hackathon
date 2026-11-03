"use client";

import { type FormEvent, useState } from "react";
import type { KnowledgeResult } from "@/lib/knowledge";
import { KnowledgeResults } from "./KnowledgeResults";

export function KnowledgeFinder({ viewerName }: { viewerName: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [results, setResults] = useState<KnowledgeResult[] | null>(null);
  const [scripted, setScripted] = useState(false);

  async function find(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      const response = await fetch("/api/chie/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = (await response.json()) as { results: KnowledgeResult[]; mode: string };
      setResults(body.results);
      setScripted(body.mode === "scripted");
    } catch {
      setProblem("探せませんでした。もう一度押してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-label="知恵を探す">
      <form className="chie-form" onSubmit={(event) => void find(event)}>
        <label htmlFor="chie-query">やりたいこと、困っていること</label>
        <textarea id="chie-query" rows={2} maxLength={2000} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" disabled={busy || query.trim() === ""}>
          {busy ? "探しています…" : "校内の知恵を探す"}
        </button>
      </form>
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {scripted && <p className="muted">いまは台本で動いています。</p>}
      {results?.length === 0 && <p>今は近いものが見つかりませんでした。</p>}
      {results && results.length > 0 && <KnowledgeResults results={results} viewerName={viewerName} />}
    </section>
  );
}
