"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/app/Avatar";
import { playReachedSound } from "@/app/sound";
import type { EvolutionCandidate } from "@/lib/avatar-evolve";

const FLASH_MS = 1800;

async function post(body: unknown) {
  const response = await fetch("/api/avatar/evolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, data };
}

/** 進化は本人が選ぶ。選ぶまで今の姿のまま。急かさず、選ばなくても減らない。 */
export function EvolutionCard() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<EvolutionCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [chosen, setChosen] = useState<EvolutionCandidate | null>(null);

  async function look() {
    setBusy(true);
    setProblem("");
    const { ok, data } = await post({ action: "candidates" }).catch(() => ({ ok: false, data: {} as Record<string, unknown> }));
    if (ok) setCandidates(data.candidates as EvolutionCandidate[]);
    else setProblem("候補を出せませんでした。もう一度押してください。");
    setBusy(false);
  }

  async function choose(candidate: EvolutionCandidate) {
    setBusy(true);
    setProblem("");
    const { ok } = await post({ action: "choose", family: candidate.family }).catch(() => ({ ok: false }));
    setBusy(false);
    if (!ok) {
      setProblem("選べませんでした。もう一度押してください。");
      return;
    }
    setChosen(candidate);
    playReachedSound();
    setTimeout(() => router.refresh(), FLASH_MS);
  }

  return (
    <section className="card evolve-card" aria-label="進化">
      <h2>相棒が進化できそう！</h2>
      <p>人とのやり取りで育ちました。どんな姿にするかは、あなたが選びます。</p>
      {!candidates && (
        <button type="button" disabled={busy} onClick={() => void look()}>
          {busy ? "候補を探しています…" : "進化の候補を見る"}
        </button>
      )}
      {candidates && (
        <div className="evolve-choices">
          {candidates.map((candidate) => (
            <button key={candidate.family} type="button" disabled={busy} onClick={() => void choose(candidate)}>
              <Avatar image={candidate.image} alt="" size={104} />
              <strong>{candidate.name}</strong>
              <small>{candidate.reason}</small>
            </button>
          ))}
        </div>
      )}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {chosen &&
        createPortal(
          <div className="evolve-flash" role="status">
            <Avatar image={chosen.image} alt={chosen.name} size={240} />
            <h2>{chosen.name}に進化！</h2>
          </div>,
          document.body,
        )}
    </section>
  );
}
