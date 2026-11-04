"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playReachedSound } from "@/app/sound";

const POLL_MS = 1500;
const POLL_LIMIT = 60;
const MIN_READING_MS = 1600;
const EGG_MS = 1200;
const CRACK_MS = 700;

type State = { status: string; talent: string; reason: string; image: string; name: string; color: string };
type Phase = "reading" | "egg" | "crack" | "born";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 写真 → 読み取りの光 → 卵 → 割れて誕生 → 得意なこと。白い縁のステッカーと、大胆な単色の背景で見せる。 */
export function PhotoHatch({ eggImage, onFailed }: { eggImage: string; onFailed(): void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("reading");
  const [state, setState] = useState<State | null>(null);
  const failed = useRef(onFailed);

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    (async () => {
      for (let i = 0; i < POLL_LIMIT && !stopped; i++) {
        await wait(POLL_MS);
        const response = await fetch("/api/avatar/photo").catch(() => null);
        const next = response?.ok ? ((await response.json()) as State) : null;
        if (next?.status === "pending" || !next) continue;
        if (next.status !== "ready") break;
        await wait(Math.max(0, MIN_READING_MS - (Date.now() - started)));
        if (stopped) return;
        setState(next);
        setPhase("egg");
        await wait(EGG_MS);
        if (stopped) return;
        setPhase("crack");
        await wait(CRACK_MS);
        if (stopped) return;
        setPhase("born");
        playReachedSound();
        return;
      }
      if (!stopped) failed.current();
    })();
    return () => {
      stopped = true;
    };
  }, []);

  // 親の動きに影響されないよう、画面全体に直接出す
  return createPortal(
    <div className={`hatch-stage ${phase}`} role="dialog" aria-label="相棒の誕生" style={state ? { background: state.color } : undefined}>
      {phase === "reading" && (
        <div className="hatch-photo">
          <img src="/api/avatar/photo?image=1" alt="登録している写真" width={180} height={180} />
          <span className="hatch-scan" aria-hidden="true" />
        </div>
      )}
      {(phase === "egg" || phase === "crack") && <img className="hatch-egg sticker" src={eggImage} alt="卵" width={200} height={200} />}
      {phase === "born" && state && <img className="hatch-born sticker" src={state.image} alt={`生まれた相棒、${state.name}`} width={240} height={240} />}

      <div className="hatch-words" role="status">
        {phase === "reading" && <h2>写真の色と雰囲気を読んでいます</h2>}
        {phase === "egg" && <h2>卵が生まれた！</h2>}
        {phase === "crack" && <h2>あっ、動いた！</h2>}
        {phase === "born" && state && (
          <>
            <h2>{state.name}が生まれた！</h2>
            {state.talent && <p className="hatch-talent">得意：{state.talent}</p>}
            {state.reason && <p className="hatch-reason">{state.reason}</p>}
            <button type="button" onClick={() => router.refresh()}>
              よろしくね
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
