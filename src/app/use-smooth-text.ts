"use client";

import { useEffect, useRef, useState } from "react";

/** 1こまで増やす文字の数を決める。遅れが大きいほど速く追いつく */
export function nextLength(shown: number, target: number): number {
  const behind = target - shown;
  if (behind <= 0) return target;
  return shown + Math.max(1, Math.ceil(behind / 6));
}

/**
 * 聞き取りの途中の文字を、なめらかに出す。電波が弱くて文字がまとめて届いても、
 * 一度に飛ばさず、少しずつ追いつく。言い直しで前の文字が変わったときは、すぐに入れ替える。
 */
export function useSmoothText(target: string, stepMs = 33): string {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const current = shownRef.current;
    if (!target.startsWith(current)) {
      // 言い直しなどで前の文字が変わった。届いた分のうち、同じところまでは残す
      let same = 0;
      while (same < current.length && same < target.length && current[same] === target[same]) same += 1;
      shownRef.current = target.slice(0, same);
      setShown(shownRef.current);
    }
    if (shownRef.current === target) return;
    const timer = setInterval(() => {
      const next = target.slice(0, nextLength(shownRef.current.length, target.length));
      shownRef.current = next;
      setShown(next);
      if (next === target) clearInterval(timer);
    }, stepMs);
    return () => clearInterval(timer);
  }, [target, stepMs]);

  return shown;
}
