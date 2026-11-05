"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { swipeTarget } from "@/lib/swipe-nav";

/** 操作の途中の指の動きを、画面の移動にしない場所 */
const NO_SWIPE = "[data-noswipe], input, textarea, select, button, a, summary";
/** 横画面は上下で移るので、上下にスクロールする液晶の中では移らない */
const LANDSCAPE = "(orientation: landscape) and (max-height: 560px)";
const NO_SWIPE_LANDSCAPE = "[data-noswipe-landscape]";

/** レトロの画面をスワイプで行き来する。下のナビからも同じ画面へ行ける（スワイプだけの操作にしない）。 */
export function SwipeNav() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null;
      const landscape = window.matchMedia(LANDSCAPE).matches;
      const blocked =
        event.touches.length !== 1 ||
        document.documentElement.dataset.theme !== "retro" ||
        target?.closest(NO_SWIPE) ||
        (landscape && target?.closest(NO_SWIPE_LANDSCAPE));
      start = blocked ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const landscape = window.matchMedia(LANDSCAPE).matches;
      const next = swipeTarget(pathname, touch.clientX - start.x, touch.clientY - start.y, landscape);
      start = null;
      if (next) router.push(next);
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [pathname, router]);

  return null;
}
