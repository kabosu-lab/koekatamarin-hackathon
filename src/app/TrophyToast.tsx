"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { audioOutput } from "@/app/sound";
import { schedulePop } from "@/lib/send-sound";
import type { NewRibbon } from "@/lib/ribbons";
import { Sticker } from "./Sticker";
import "./trophy-toast.css";

/** 画面が落ち着いて、返事の知らせ（ReplyToast）が先に出てから出す */
const START_MS = 400;
/** 1つを見せる時間（2〜3秒） */
const SHOW_MS = 2600;
/** 隠しトロフィーの「？？？」から名前までの一拍 */
const REVEAL_MS = 700;
/** 消える動きと、次までの間 */
const EXIT_MS = 180;
const GAP_MS = 160;

/** コレクションのそのトロフィーを開く行き先。開く側（me/）が trophy を読む。 */
export function trophyHref(id: string): string {
  return `/me?open=collect&trophy=${encodeURIComponent(id)}`;
}

/** 取った瞬間の短い音。ポンの明るい分散和音で、ファンファーレ（進化）や返事のポロン2音とは別の形。 */
function playTrophyChime(): void {
  const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive;
  if (active === false) return;
  const output = audioOutput();
  if (!output) return;
  try {
    const t0 = output.audio.currentTime + 0.02;
    for (const [delay, note, volume] of [
      [0, 84, 0.26],
      [0.06, 88, 0.28],
      [0.12, 91, 0.32],
      [0.12, 84, 0.16],
    ]) {
      schedulePop(output.audio, output.out, t0 + delay, note, volume);
    }
  } catch {
    // 音が出せなくても、知らせには関係ない
  }
}

/** 返事の知らせが窓の上に出ていれば、その下に出す（重ねない） */
function topBelowReplyToast(): number | undefined {
  const reply = document.querySelector(".reply-toast")?.getBoundingClientRect();
  return reply && reply.height > 0 ? Math.round(reply.bottom + 8) : undefined;
}

/**
 * トロフィーを取った瞬間の小さな知らせ。上からすっと出て、2〜3秒で自分で消える。押すとコレクションのそのトロフィーが開く。
 * 生徒には「🏆 実績解除！」、先生には「トロフィーが届きました：」と落ち着いた形で。
 * 何個も同時に取ったときは、重ねずに1つずつ順に出す。広い画面の横の欄（iframe）の中では出さない（同じことを2か所で出さない）。
 */
export function TrophyToast({ trophies }: { trophies: NewRibbon[] }) {
  // サーバーでは出さず、画面に届いてから出す（-1 はまだ）
  const [index, setIndex] = useState(-1);
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [top, setTop] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (trophies.length === 0 || window.self !== window.top) return;
    void fetch("/api/ribbons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => undefined);
    const timer = setTimeout(() => setIndex(0), START_MS);
    return () => clearTimeout(timer);
  }, [trophies.length]);

  useEffect(() => {
    const current = trophies[index];
    if (!current) return;
    setTop(topBelowReplyToast());
    setLeaving(false);
    setRevealed(!current.hidden);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = current.hidden ? REVEAL_MS : 0;
    if (current.hidden) {
      timers.push(
        setTimeout(() => {
          setRevealed(true);
          playTrophyChime();
        }, REVEAL_MS),
      );
    } else {
      playTrophyChime();
    }
    timers.push(setTimeout(() => setLeaving(true), wait + SHOW_MS));
    timers.push(setTimeout(() => setIndex(index + 1), wait + SHOW_MS + EXIT_MS + GAP_MS));
    return () => timers.forEach(clearTimeout);
  }, [index, trophies]);

  useEffect(() => {
    if (index < 0 || index >= trophies.length) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIndex(trophies.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, trophies.length]);

  const current = trophies[index];
  if (!current) return null;
  const name = revealed ? current.name : "？？？";
  const line = current.quip ?? current.story;
  return createPortal(
    <div className="trophy-toast-layer" style={top === undefined ? undefined : { top }}>
      <Link
        key={`${index}-${current.id}`}
        className="trophy-toast"
        href={trophyHref(current.id)}
        role="status"
        aria-live="polite"
        aria-label={current.polite ? "届いたトロフィー" : "実績解除"}
        data-leaving={leaving ? "true" : undefined}
        data-revealed={revealed ? "true" : "false"}
        data-trophy={revealed ? current.id : undefined}
      >
        <span className="trophy-toast-art" aria-hidden="true">
          {revealed ? <Sticker art={current.art} /> : <span className="trophy-toast-secret">？</span>}
        </span>
        <span className="trophy-toast-text">
          <span className="trophy-toast-title">
            {current.polite ? (
              <span className="trophy-toast-lead">トロフィーが届きました：</span>
            ) : (
              <span className="trophy-toast-lead">
                <span aria-hidden="true">🏆 </span>実績解除！{" "}
              </span>
            )}
            <strong key={name} className="trophy-toast-name">
              {name}
            </strong>
          </span>
          {revealed && <small className="trophy-toast-line">{line}</small>}
        </span>
      </Link>
    </div>,
    document.body,
  );
}
