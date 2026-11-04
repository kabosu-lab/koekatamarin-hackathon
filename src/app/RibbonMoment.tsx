"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { playReachedSound } from "@/app/sound";
import type { RibbonDefinition } from "@/lib/ribbons";

const SHOW_MS = 3200;

/** リボンをもらった瞬間の、短い動きと音。操作を邪魔しない。開いただけのときは音を鳴らさない。 */
export function RibbonMoment({ ribbons }: { ribbons: RibbonDefinition[] }) {
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
    if (active) playReachedSound();
    const timer = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [ribbons.length]);

  if (!open || ribbons.length === 0) return null;
  return createPortal(
    <div className="ribbon-moment" role="status">
      <span className="ribbon-mark" aria-hidden="true" />
      <div>
        <strong>リボンが届きました</strong>
        <span>{ribbons.map((ribbon) => ribbon.name).join("、")}</span>
      </div>
    </div>,
    document.body,
  );
}
