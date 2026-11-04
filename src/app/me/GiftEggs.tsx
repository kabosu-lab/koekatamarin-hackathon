"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/app/Avatar";
import { playReachedSound } from "@/app/sound";
import type { CompanionView, GiftEggView, HatchedView } from "@/lib/gift-eggs";

const EGG_MS = 900;
const CRACK_MS = 800;

async function post(body: unknown) {
  const response = await fetch("/api/gift-eggs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = response?.ok ? ((await response.json()) as Record<string, unknown>) : null;
  return data;
}

function Hatch({ hatched, onDone }: { hatched: HatchedView; onDone(useNow: boolean): void }) {
  const [phase, setPhase] = useState<"egg" | "crack" | "born">("egg");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("crack"), EGG_MS),
      setTimeout(() => {
        setPhase("born");
        playReachedSound();
      }, EGG_MS + CRACK_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return createPortal(
    <div className={`hatch-stage ${phase}`} role="dialog" aria-label="贈り物の卵" style={{ background: hatched.color }}>
      {phase !== "born" && <img className="hatch-egg sticker" src="/api/art/egg.png" alt="卵" width={200} height={200} />}
      {phase === "born" && <img className="hatch-born sticker" src={`/api/art/${hatched.image}`} alt={`生まれた相棒、${hatched.name}`} width={240} height={240} />}
      <div className="hatch-words" role="status">
        {phase === "egg" && <h2>贈り物の卵が開きます</h2>}
        {phase === "crack" && <h2>あっ、動いた！</h2>}
        {phase === "born" && (
          <>
            <h2>{hatched.name}が生まれた！</h2>
            {hatched.reason && <p className="hatch-reason">{hatched.reason}</p>}
            <button type="button" onClick={() => onDone(true)}>
              今の相棒にする
            </button>
            <button type="button" className="secondary" onClick={() => onDone(false)}>
              あとで選ぶ
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** 贈り物の卵と、手持ちの相棒。人の役に立つと届く。育ちはどの相棒でも失わない。 */
export function GiftEggs({ eggs, companions }: { eggs: GiftEggView[]; companions: CompanionView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [hatched, setHatched] = useState<HatchedView | null>(null);

  async function open(id: string) {
    setBusy(true);
    setProblem("");
    const data = await post({ action: "open", id });
    setBusy(false);
    if (data) setHatched(data.hatched as HatchedView);
    else setProblem("卵を開けられませんでした。もう一度押してください。");
  }

  async function select(family: string) {
    setBusy(true);
    setProblem("");
    const data = await post({ action: "select", family });
    setBusy(false);
    if (!data) setProblem("選べませんでした。もう一度押してください。");
    router.refresh();
  }

  async function finish(useNow: boolean) {
    const family = hatched?.family;
    setHatched(null);
    if (useNow && family) await select(family);
    else router.refresh();
  }

  if (eggs.length === 0 && companions.length < 2) return null;

  return (
    <section className="card gift-eggs" aria-label="贈り物の卵">
      <h2>贈り物の卵</h2>
      {eggs.length > 0 ? (
        <>
          <p>誰かの役に立ったので、卵が届きました。</p>
          <div className="gift-egg-row">
            {eggs.map((egg) => (
              <button key={egg.id} type="button" className="gift-egg" disabled={busy} onClick={() => void open(egg.id)}>
                <img className="sticker" src="/api/art/egg.png" alt="" width={72} height={72} />
                開ける
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">人の役に立つと、また届きます。</p>
      )}
      {companions.length > 1 && (
        <>
          <h3>手持ちの相棒</h3>
          <ul className="companion-list">
            {companions.map((companion) => (
              <li key={companion.family}>
                <button type="button" disabled={busy || companion.isCurrent} aria-pressed={companion.isCurrent} onClick={() => void select(companion.family)}>
                  <Avatar image={companion.image} alt="" size={72} />
                  {companion.name}
                  {companion.isCurrent && <small>今の相棒</small>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {problem && (
        <p className="notice" role="alert">
          {problem}
        </p>
      )}
      {hatched && <Hatch hatched={hatched} onDone={(useNow) => void finish(useNow)} />}
    </section>
  );
}
