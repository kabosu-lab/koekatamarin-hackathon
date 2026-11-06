"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { playCommitPop, playReachedSound } from "../sound";
import { digitColumns, parseCounts, planRoll, ROLL_MS, type RollPlan, SO_FAR_ITEMS, type SoFarCounts } from "./so-far-roll";
import "./so-far.css";

/** 着いた札（▲+N）が見えている長さ。動きを減らす設定では、動かさずに長めに置く */
const BADGE_MS = 1500;
const BADGE_REDUCED_MS = 3000;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** 窓のパートナーを1回だけ小さく弾ませる（モダンでは絵がないので何もしない） */
function bumpPartner() {
  const image = document.querySelector<HTMLElement>(".me-screen img");
  image?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.1) translateY(-3px)" }, { transform: "scale(1)" }], {
    duration: 220,
    easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  });
}

function Digits({ from, to }: { from: number; to: number }) {
  return (
    <span className="so-far-digits" aria-hidden="true">
      {digitColumns(from, to).map((column, index) => (
        <span
          key={index}
          className="so-far-digit"
          data-roll={column.rolling ? "" : undefined}
          style={{ "--from": column.from, "--to": column.to } as CSSProperties}
        >
          <span />
        </span>
      ))}
    </span>
  );
}

/**
 * 0-2b 第2段：タイルの下の「これまで」の帯。前に見たときから増えた数字だけが転がる。
 * 前回値は sessionStorage。押すと、children（インフォグラフィック）を開く。
 */
export function SoFar({
  personId,
  counts,
  onOpen,
  children,
}: {
  personId: string;
  counts: SoFarCounts;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const [plan, setPlan] = useState<RollPlan | null>(null);
  const [reduced, setReduced] = useState(false);
  // 数が変わったときだけ動く（同じ数で描き直しても転がらない）
  const signature = SO_FAR_ITEMS.map((item) => counts[item.key]).join(",");

  useEffect(() => {
    const key = `so-far:${personId}`;
    let previous: SoFarCounts | null = null;
    try {
      previous = parseCounts(window.sessionStorage.getItem(key));
      window.sessionStorage.setItem(key, JSON.stringify(counts));
    } catch {
      // 保存できなくても、数はそのまま見える
    }
    const next = planRoll(previous, counts);
    if (next.rolls.length === 0) return;
    const calm = reducedMotion();
    const timers: number[] = [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 前回値は描いたあとでしか読めない
    setReduced(calm);
    setPlan(next);
    let last = 0;
    for (const roll of next.rolls) {
      const landing = calm ? 0 : roll.delay + ROLL_MS;
      last = Math.max(last, landing);
      timers.push(
        window.setTimeout(() => {
          playCommitPop(roll.step);
          if (!calm) bumpPartner();
        }, landing),
      );
    }
    if (next.helpedRose) timers.push(window.setTimeout(() => playReachedSound(), last + 120));
    timers.push(window.setTimeout(() => setPlan(null), last + (calm ? BADGE_REDUCED_MS : BADGE_MS) + 300));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, signature]);

  const rows = [SO_FAR_ITEMS.filter((item) => !item.helped), SO_FAR_ITEMS.filter((item) => item.helped)];

  return (
    <section className="card me-so-far" aria-label="これまで" data-rolling={plan ? "" : undefined} data-reduced={reduced ? "" : undefined}>
      <button type="button" className="so-far-band" onClick={onOpen} aria-haspopup={onOpen ? "dialog" : undefined}>
        {rows.map((row, index) => (
          <span className="so-far-row" key={index} data-helped={index === 1 ? "" : undefined}>
            {row.map((item) => {
              const value = counts[item.key];
              const roll = plan?.rolls.find((candidate) => candidate.key === item.key);
              return (
                <span className="so-far-item" key={item.key} data-zero={value === 0 ? "" : undefined}>
                  {item.label}{" "}
                  {roll && !reduced ? (
                    <span className="so-far-num" style={{ "--delay": `${roll.delay}ms` } as CSSProperties}>
                      <span className="visually-hidden">{value}</span>
                      <Digits from={roll.from} to={roll.to} />
                    </span>
                  ) : (
                    <span className="so-far-num">{value}</span>
                  )}
                  {roll && (
                    <span
                      className="so-far-up"
                      style={{ "--landing": `${reduced ? 0 : roll.delay + ROLL_MS}ms` } as CSSProperties}
                    >
                      ▲+{roll.to - roll.from}
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        ))}
        <span className="so-far-more" aria-hidden="true">
          ›
        </span>
      </button>
      {children}
    </section>
  );
}
