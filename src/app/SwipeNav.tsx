"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SWIPE_SCREENS, swipeTarget } from "@/lib/swipe-nav";

/**
 * 操作の途中の指の動きを、画面の移動にしない場所。
 * ボタンやリンクの上から始めても移れるようにする（動かした指ではボタンは押されない）。
 * 押し続けて話すボタンとホイール、文字を打つ欄は除く。
 */
const NO_SWIPE = "[data-noswipe], .device-mic, input, textarea, select, dialog";
/** 横画面は上下で移るので、上下にスクロールする液晶の中では移らない */
const LANDSCAPE = "(orientation: landscape) and (max-height: 560px)";
const NO_SWIPE_LANDSCAPE = "[data-noswipe-landscape]";
/** 左右へ動かしていると決める動きの大きさ。これより前は縦のスクロールとして扱う */
const LOCK_DISTANCE = 10;
const DIRECTION_KEY = "koekata_swipe_from";
/** 離した後の動きの長さ。払う速さに合わせて、この間に収める（設計書 §2-4 の慣性） */
const MIN_MS = 120;
const MAX_MS = 260;
/** これより遅い払い方でも、この速さ（px/ms）で動いたものとして時間を決める */
const MIN_SPEED = 0.6;
const BACK_MS = 200;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

type Arrival = { from: "left" | "right"; ms: number; rest: number };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const page = () => document.querySelector<HTMLElement>("body > main, main");

/** レトロの画面をスワイプで行き来する。指に付いて動き、離すと次の画面がすべり込む。下のナビからも同じ画面へ行ける。 */
export function SwipeNav() {
  const pathname = usePathname();
  const router = useRouter();

  // 隣の画面を先に読んでおき、移るときに待たせない
  useEffect(() => {
    if (SWIPE_SCREENS.includes(pathname as (typeof SWIPE_SCREENS)[number])) {
      for (const screen of SWIPE_SCREENS) if (screen !== pathname) router.prefetch(screen);
    }
  }, [pathname, router]);

  // 移ってきた画面を、指を動かした向きからすべり込ませる
  useEffect(() => {
    let arrival: Arrival | null = null;
    try {
      const saved = sessionStorage.getItem(DIRECTION_KEY);
      sessionStorage.removeItem(DIRECTION_KEY);
      if (saved === "left" || saved === "right") arrival = { from: saved, ms: MAX_MS, rest: 0.28 };
      else if (saved) arrival = JSON.parse(saved) as Arrival;
    } catch {
      // 残せなくても移れる
    }
    const main = page();
    if (!main || !arrival || (arrival.from !== "left" && arrival.from !== "right") || reducedMotion()) return;
    // 出ていった画面の残りの距離から、同じ時間・同じイージングで入ってくる（間を空けない）
    const rest = Math.min(1, Math.max(0, Number(arrival.rest) || 0));
    const ms = Math.min(MAX_MS, Math.max(MIN_MS, Number(arrival.ms) || MAX_MS));
    const offset = `${arrival.from === "right" ? "" : "-"}${Math.round(rest * 100)}%`;
    main.animate([{ transform: `translateX(${offset})` }, { transform: "translateX(0)" }], { duration: ms, easing: EASE });
  }, [pathname]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let main: HTMLElement | null = null;
    // 横画面か・動きを減らす設定かは、指を置いたときに1回だけ調べる（動かすたびに matchMedia しない）
    let landscape = false;
    let still = false;
    // 速さを出すための、直近2回の指の位置と時刻
    let recent: { x: number; t: number }[] = [];

    const reset = () => {
      delete document.documentElement.dataset.swiping;
      if (main) {
        main.style.transition = "";
        main.style.transform = "";
        main.style.willChange = "";
      }
      main = null;
      dragging = false;
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      landscape = window.matchMedia(LANDSCAPE).matches;
      still = reducedMotion();
      const blocked =
        event.touches.length !== 1 ||
        document.documentElement.dataset.theme !== "retro" ||
        target?.closest(NO_SWIPE) ||
        (landscape && target?.closest(NO_SWIPE_LANDSCAPE));
      start = blocked ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY };
      recent = start ? [{ x: start.x, t: event.timeStamp }] : [];
      dragging = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!start || landscape || still) return;
      const point = { x: event.touches[0].clientX, t: event.timeStamp };
      recent = recent.length ? [recent[recent.length - 1], point] : [point];
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < LOCK_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        main = page();
        if (!main) return;
        dragging = true;
        // 動かしている間は、窓の 3D の描画を止める（VoiceLump が見る）。指の動きに GPU を回す
        document.documentElement.dataset.swiping = "true";
        main.style.willChange = "transform";
        main.style.transition = "none";
      }
      // 指に付いて動く。遠くへ行くほど少し重くする
      const moved = Math.sign(dx) * Math.min(Math.abs(dx), 40 + Math.abs(dx) * 0.85);
      if (main) {
        // 位置だけを transform で動かす。透明度を毎コマ変えると、iPhone では画面全体の重ね直しが重い（0-1i）
        main.style.transform = `translateX(${moved}px)`;
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const next = swipeTarget(pathname, dx, touch.clientY - start.y, landscape);
      const forward = (landscape ? touch.clientY - start.y : dx) < 0;
      start = null;
      if (!next) {
        // 届かなければ、ばねで1回だけ元の位置へ戻す
        if (main && dragging) {
          const back = main;
          back.style.transition = `transform ${BACK_MS}ms ${SPRING}`;
          back.style.transform = "translateX(0)";
          setTimeout(() => {
            if (main === back) reset();
            else {
              delete document.documentElement.dataset.swiping;
              back.style.transition = "";
              back.style.willChange = "";
            }
          }, BACK_MS);
          main = null;
          dragging = false;
        }
        return;
      }
      const leaving = main ?? page();
      const width = window.innerWidth || 1;
      // 払った速さ（px/ms）。速く払えば速く、ゆっくり離せばゆっくり吸い付く
      const [a, b] = recent.length >= 2 ? recent : [{ x: touch.clientX, t: 0 }, { x: touch.clientX, t: 1 }];
      const speed = Math.max(Math.abs((b.x - a.x) / Math.max(1, b.t - a.t)), MIN_SPEED);
      const moved = leaving ? Math.abs(new DOMMatrixReadOnly(getComputedStyle(leaving).transform).m41) : 0;
      const remaining = Math.max(0, width - moved);
      const ms = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, remaining / speed)));
      const animate = Boolean(leaving) && !still && !landscape;
      try {
        // 次の画面は、指を動かした向きの反対側から、出ていった画面の残りの距離と同じ時間で入ってくる
        const arrival: Arrival = { from: forward ? "right" : "left", ms, rest: animate ? remaining / width : 0.28 };
        sessionStorage.setItem(DIRECTION_KEY, JSON.stringify(arrival));
      } catch {
        // 残せなくても移れる
      }
      if (leaving && animate) {
        // 位置だけを transform で動かす（透明度は動かさない。iPhone では画面全体の重ね直しが重い）
        leaving.style.willChange = "transform";
        leaving.style.transition = `transform ${ms}ms ${EASE}`;
        leaving.style.transform = `translateX(${forward ? "-" : ""}${width}px)`;
        // 新しい画面に入れ替わらなかったときのために戻す
        setTimeout(() => {
          // 移れたなら古い画面はもう無く、今の状態は新しい画面のもの。触らない
          if (!leaving.isConnected) return;
          delete document.documentElement.dataset.swiping;
          leaving.style.transition = "";
          leaving.style.transform = "";
          leaving.style.willChange = "";
        }, 1500);
      }
      // 離した瞬間に次の画面を読み込み始める。出ていく動きの終わりを待たない
      router.push(next);
      main = null;
      dragging = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      reset();
    };
  }, [pathname, router]);

  return null;
}
