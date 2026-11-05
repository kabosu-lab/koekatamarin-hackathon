"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { playRibbonSound } from "@/app/sound";
import type { NewRibbon } from "@/lib/ribbons";
import { Sticker } from "./Sticker";

const SHOW_MS = 4200;
/** 一度にたくさん届いたときに、名前を並べる数 */
const MAX_OTHERS = 3;
const CONFETTI = [
  ["#ff5a3c", "-7rem", "-3rem", "220deg"],
  ["#ffd23c", "-4.5rem", "-5.5rem", "-160deg"],
  ["#2545f0", "-2rem", "-6.5rem", "300deg"],
  ["#18a96b", "2rem", "-6.5rem", "-240deg"],
  ["#ff4d8d", "4.5rem", "-5.5rem", "180deg"],
  ["#8a4dff", "7rem", "-3rem", "-200deg"],
  ["#ffd23c", "-8rem", "2rem", "140deg"],
  ["#ff5a3c", "8rem", "2rem", "-140deg"],
];

/** トロフィーが贈られた瞬間。真ん中に大きく飛び出す。押すとすぐ閉じる。開いただけのときは音を鳴らさない。 */
export function RibbonMoment({ ribbons }: { ribbons: NewRibbon[] }) {
  // サーバーでは出さず、画面に届いてから出す
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ribbons.length === 0) return;
    setOpen(true);
    void fetch("/api/ribbons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => undefined);
    const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
    if (active) playRibbonSound();
    const timer = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [ribbons.length]);

  if (!open || ribbons.length === 0) return null;
  const [first, ...others] = ribbons;
  return createPortal(
    <button type="button" className="ribbon-moment" onClick={() => setOpen(false)} aria-label="閉じる">
      <span className="ribbon-card" role="status">
        {CONFETTI.map(([color, dx, dy, rotate], index) => (
          <i
            key={index}
            className="ribbon-confetti"
            style={{ "--c": color, "--dx": dx, "--dy": dy, "--r": rotate } as React.CSSProperties}
          />
        ))}
        <Sticker art={first.art} />
        <small>{first.hidden ? "隠しトロフィーが届きました" : "トロフィーが届きました"}</small>
        <strong>{first.name}</strong>
        <span className="ribbon-card-story">{first.story}</span>
        {first.quip && <small>{first.quip}</small>}
        {others.length > 0 && (
          <small>
            ほかに：{others.slice(0, MAX_OTHERS).map((ribbon) => ribbon.name).join("、")}
            {others.length > MAX_OTHERS && " など"}
          </small>
        )}
      </span>
    </button>,
    document.body,
  );
}
