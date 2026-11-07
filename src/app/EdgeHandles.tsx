"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WIDE_QUERY } from "@/lib/wide";
import { EDGE_HINT_KEY, hintPending, markHintSeen, reducedMotion, whenCalm } from "./first-hint";
import { STRIP_LAND_EVENT } from "./strip";

/** 隣の画面の端を覗かせるときの、帯へ与える初めの速さ（画面の幅／秒）。ばね（wheel-carousel の springStep）で約 9% 覗いて戻る */
const PEEK_VELOCITY = 3;
/** 帯が使えるようになるのを待つ長さ（左右の画面は少し遅れて裏で読み込む） */
const WAIT_MS = 15_000;

/** check が続けて ms の間 true のときだけ true を返す */
function settledFor(check: () => boolean, ms: number) {
  let since = 0;
  return () => {
    if (!check()) {
      since = 0;
      return false;
    }
    if (!since) since = performance.now();
    return performance.now() - since >= ms;
  };
}

/**
 * 0-3i：話す画面の本体の左右の端、上下のまん中に置く、縦向きのつまみの棒（ホームバーを縦にした形）。
 * 押すと、その側の画面へ移る。リンクなので、帯が使えるときは帯が動き（WidePanels のクリックの受け口が strip.go を呼ぶ）、
 * 使えないときは今の行き来と同じく、その画面を開く。つまんで引く動きは SwipeNav の帯の指の動きがそのまま受ける。
 * 3列（横向きで高さ 600 以上）のときは CSS で出さない。
 *
 * 初めて開いたときだけ、棒が一度外へ揺れ、帯をばねで少しだけ動かして隣の画面の端を見せて戻す（右、次に左）。
 */
export function EdgeHandles() {
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    if (window.self !== window.top || !hintPending(EDGE_HINT_KEY) || reducedMotion() || window.matchMedia(WIDE_QUERY).matches) return;
    const root = document.documentElement;
    let cancelled = false;
    const timers: number[] = [];
    // 覗かせる前に帯がほかの理由で動いたら（下の印・リンク・指）、覗きはやめる（その人はもう帯を知っている。動きを奪わない）
    let moved = false;
    let own = false;
    const onMoved = () => {
      if (!own) moved = true;
    };
    window.addEventListener(STRIP_LAND_EVENT, onMoved);
    const peek = (velocity: number) =>
      new Promise<void>((resolve) => {
        const strip = window.koekataStrip;
        // 帯がほかの理由で動いている途中（transform を書いている）や、左右の画面にいるときは覗かせない（その動きを止めない）
        const moving = Boolean(document.querySelector<HTMLElement>(".device-row > .retro-home")?.style.transform);
        if (cancelled || moved || !strip || moving || strip.rest() !== 0 || new URLSearchParams(location.search).has("pane") || root.dataset.stripReady !== "true")
          return resolve();
        const done = () => {
          own = false;
          window.removeEventListener(STRIP_LAND_EVENT, done);
          resolve();
        };
        window.addEventListener(STRIP_LAND_EVENT, done);
        timers.push(window.setTimeout(done, 1500));
        own = true;
        strip.settle(0, velocity, 0, "none");
      });
    const stop = whenCalm(
      () => {
        markHintSeen(EDGE_HINT_KEY);
        root.dataset.edgeHint = "shown";
        setNudge(true);
        timers.push(window.setTimeout(() => !cancelled && setNudge(false), 1400));
        // 棒が外へ揺れるのに合わせて、みんな（右）、次に履歴と設定（左）の端を覗かせる
        timers.push(
          window.setTimeout(() => {
            void peek(-PEEK_VELOCITY).then(() => peek(PEEK_VELOCITY));
          }, 120),
        );
      },
      // 帯（左右の画面の裏の読み込み）が整ってから。整わないまま時間が過ぎたら、棒の揺れだけを見せる
      // 整ってすぐは、帯を使う操作（下の印やリンク）と重なりやすいので、整ってから少し置く
      { delayMs: 600, limitMs: WAIT_MS, ready: settledFor(() => root.dataset.stripReady === "true", 1200) },
    );
    // 帯が整わない（裏の読み込みが止められているなど）ときは、待ち切る少し前に棒だけ揺らす
    const fallback = window.setTimeout(() => {
      if (cancelled || root.dataset.edgeHint) return;
      stop();
      whenCalm(
        () => {
          markHintSeen(EDGE_HINT_KEY);
          root.dataset.edgeHint = "shown";
          setNudge(true);
          timers.push(window.setTimeout(() => !cancelled && setNudge(false), 1400));
        },
        { delayMs: 0, limitMs: 5000 },
      );
    }, 10_000);
    return () => {
      cancelled = true;
      window.removeEventListener(STRIP_LAND_EVENT, onMoved);
      stop();
      window.clearTimeout(fallback);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <Link href="/me" className="edge-handle" data-side="left" data-nudge={nudge || undefined} aria-label="履歴と設定へ">
        <span className="edge-handle-bar" aria-hidden="true" />
      </Link>
      <Link href="/minna" className="edge-handle" data-side="right" data-nudge={nudge || undefined} aria-label="みんなへ">
        <span className="edge-handle-bar" aria-hidden="true" />
      </Link>
    </>
  );
}
