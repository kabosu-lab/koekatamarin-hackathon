"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { audioOutput } from "@/app/sound";
import { schedulePop } from "@/lib/send-sound";
import type { NewRibbon } from "@/lib/ribbons";
import { Sticker } from "./Sticker";
import { useQuietScreen } from "./use-quiet-screen";
import "./trophy-toast.css";

/** 画面が落ち着いてから出す */
const START_MS = 400;
/** 1つを見せる時間（2〜3秒） */
const SHOW_MS = 2600;
/** 隠しトロフィーの「？？？」から名前までの一拍 */
const REVEAL_MS = 700;
/** 消える動きと、次までの間 */
const EXIT_MS = 180;
const GAP_MS = 160;

/** 知らせを重ねない下の部品：マイクの輪のある行・「‹ 履歴と設定 / みんな ›」の行・下のタブ */
const BOTTOM_PARTS = ".device-controls, .swipe-mark, .bottom-nav";
/** 下の部品と知らせの間 */
const BOTTOM_GAP = 8;

/** 下の部品のいちばん上の端から、知らせの下端までの高さ（px）。下の部品がない画面では null（安全域の上に出す） */
function bottomClearance(): number | null {
  const height = window.innerHeight;
  let top = height;
  for (const element of document.querySelectorAll(BOTTOM_PARTS)) {
    const box = element.getBoundingClientRect();
    // 見えていない部品と、画面の上半分にある部品は見ない
    if (box.width === 0 || box.height === 0 || box.top < height / 2) continue;
    top = Math.min(top, box.top);
  }
  return top < height ? height - top + BOTTOM_GAP : null;
}

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

/**
 * トロフィーを取った瞬間の小さな知らせ。マイクの輪と下の帯（‹ 履歴と設定 / みんな ›）のすぐ上にすっと出て、2〜3秒で自分で消える。押すとコレクションのそのトロフィーが開く。
 * 生徒には「🏆 実績解除！」、先生には「トロフィーが届きました：」と落ち着いた形で。
 * 何個も同時に取ったときは、重ねずに1つずつ順に出す。広い画面の横の欄（iframe）の中では出さない（同じことを2か所で出さない）。
 */
/** hold：この端末でまだ開けていないサンクスカードがあるあいだ（封筒をしまうまで）待たせる。差出人を封筒より先に見せない */
export function TrophyToast({ trophies: incoming, hold = false }: { trophies: NewRibbon[]; hold?: boolean }) {
  // 最初に受け取った一覧を持っておく。封筒をしまったあとの読み直しで「見た」あとの空の一覧が来ても、見せている途中で消さない
  const [trophies, setTrophies] = useState(incoming);
  useEffect(() => {
    if (incoming.length > 0) setTrophies((held) => (held.length > 0 ? held : incoming));
  }, [incoming]);
  // サーバーでは出さず、画面に届いてから出す（-1 はまだ）
  const [index, setIndex] = useState(-1);
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // 0-2q(1)：最初の注意カード・開けていない封筒・シートやモーダルが出ている間は待ち、閉じてから出す。
  // 見せている途中で何かが前に出たら、いったん引っ込めて、閉じたあとにその1つから出し直す
  const quiet = useQuietScreen();
  const clear = quiet && !hold;
  const told = useRef(false);

  useEffect(() => {
    if (!clear || trophies.length === 0 || window.self !== window.top) return;
    if (!told.current) {
      told.current = true;
      void fetch("/api/ribbons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seen" }),
      }).catch(() => undefined);
    }
    const timer = setTimeout(() => setIndex((current) => (current < 0 ? 0 : current)), START_MS);
    return () => clearTimeout(timer);
  }, [clear, trophies.length]);

  useEffect(() => {
    const current = trophies[index];
    if (!current || !clear) return;
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
  }, [index, trophies, clear]);

  useEffect(() => {
    if (index < 0 || index >= trophies.length) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIndex(trophies.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, trophies.length]);

  const current = trophies[index];
  const showing = Boolean(current) && clear;
  // 下の帯とマイクの輪に重ならない高さ。出ている間に画面の大きさが変わったら測り直す
  const [lift, setLift] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!showing) return;
    const measure = () => setLift(bottomClearance());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [showing]);

  if (!current || !clear) return null;
  const name = revealed ? current.name : "？？？";
  const line = current.quip ?? current.story;
  return createPortal(
    <div className="trophy-toast-layer" style={lift === null ? undefined : { bottom: `max(${lift}px, calc(env(safe-area-inset-bottom, 0px) + 12px))` }}>
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
