"use client";

import { useEffect, useState } from "react";

/** 最初の注意カード（試用版の注意・最初の約束）の暗幕。Talk.tsx と TrialNotice.tsx が出す */
const FIRST_CARD = ".first-card-backdrop";

/**
 * 0-2q(1)(10)：最初の注意カードが出ている間は false。カードが消えたら true になる。
 * カードの後ろで吹き出しや知らせを先に出さないために使う。カードは開いた直後に出ることがあるので、
 * 最初は false にしておき、描き終わってから確かめる。
 */
export function useFirstCardClear(): boolean {
  const [clear, setClear] = useState(false);
  useEffect(() => {
    const check = () => setClear(document.querySelector(FIRST_CARD) === null);
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    // カードは開いた直後の effect で出るので、少し待ってから確かめる（裏のタブでも動くよう、描画の合図は使わない）
    const timer = setTimeout(check, 50);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return clear;
}
