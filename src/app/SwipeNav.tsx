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
const OUT_MS = 160;
const IN_MS = 240;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

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
    let from: string | null = null;
    try {
      from = sessionStorage.getItem(DIRECTION_KEY);
      sessionStorage.removeItem(DIRECTION_KEY);
    } catch {
      // 残せなくても移れる
    }
    const main = page();
    if (!main || (from !== "left" && from !== "right") || reducedMotion()) return;
    const offset = from === "right" ? "28%" : "-28%";
    main.animate([{ transform: `translateX(${offset})`, opacity: 0.4 }, { transform: "translateX(0)", opacity: 1 }], { duration: IN_MS, easing: EASE });
  }, [pathname]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dragging = false;
    let main: HTMLElement | null = null;

    const reset = () => {
      if (main) {
        main.style.transition = "";
        main.style.transform = "";
        main.style.opacity = "";
        main.style.willChange = "";
      }
      main = null;
      dragging = false;
    };

    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      const landscape = window.matchMedia(LANDSCAPE).matches;
      const blocked =
        event.touches.length !== 1 ||
        document.documentElement.dataset.theme !== "retro" ||
        target?.closest(NO_SWIPE) ||
        (landscape && target?.closest(NO_SWIPE_LANDSCAPE));
      start = blocked ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY };
      dragging = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!start || window.matchMedia(LANDSCAPE).matches || reducedMotion()) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < LOCK_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
        main = page();
        if (!main) return;
        dragging = true;
        main.style.willChange = "transform";
        main.style.transition = "none";
      }
      // 指に付いて動く。遠くへ行くほど少し重くする
      const moved = Math.sign(dx) * Math.min(Math.abs(dx), 40 + Math.abs(dx) * 0.85);
      if (main) {
        main.style.transform = `translateX(${moved}px)`;
        main.style.opacity = String(1 - Math.min(Math.abs(dx) / window.innerWidth, 0.5));
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const landscape = window.matchMedia(LANDSCAPE).matches;
      const dx = touch.clientX - start.x;
      const next = swipeTarget(pathname, dx, touch.clientY - start.y, landscape);
      start = null;
      if (!next) {
        // 届かなければ、元の位置へなめらかに戻す
        if (main && dragging) {
          const back = main;
          back.style.transition = `transform ${IN_MS}ms ${EASE}, opacity ${IN_MS}ms ${EASE}`;
          back.style.transform = "translateX(0)";
          back.style.opacity = "1";
          setTimeout(() => {
            if (main === back) reset();
            else {
              back.style.transition = "";
              back.style.willChange = "";
            }
          }, IN_MS);
          main = null;
          dragging = false;
        }
        return;
      }
      const forward = (landscape ? touch.clientY - start!.y : dx) < 0;
      try {
        // 次の画面は、指を動かした向きの反対側から入ってくる
        sessionStorage.setItem(DIRECTION_KEY, forward ? "right" : "left");
      } catch {
        // 残せなくても移れる
      }
      const leaving = main ?? page();
      if (leaving && !reducedMotion() && !landscape) {
        leaving.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
        leaving.style.transform = `translateX(${forward ? "-" : ""}${Math.round(window.innerWidth * 0.6)}px)`;
        leaving.style.opacity = "0";
        setTimeout(() => router.push(next), OUT_MS - 40);
        // 新しい画面に入れ替わらなかったときのために戻す
        setTimeout(() => {
          leaving.style.transition = "";
          leaving.style.transform = "";
          leaving.style.opacity = "";
          leaving.style.willChange = "";
        }, 1500);
      } else {
        router.push(next);
      }
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
