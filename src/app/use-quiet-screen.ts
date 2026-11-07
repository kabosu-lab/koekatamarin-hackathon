"use client";

import { useEffect, useState } from "react";

/**
 * 前に出ているもの：最初の注意カード、開けていない封筒（話す画面の足元）、封筒の演出、開いているシートやモーダル。
 * これらが出ている間は、トロフィーの知らせを待たせる（封筒より先に差出人が分かる・重なるのを避ける）。
 */
const FOREGROUND = [
  ".first-card-backdrop",
  ".lcd-companion[data-envelope]",
  ".thanks-reveal",
  '.bottom-sheet[data-state="open"]',
  '[aria-modal="true"]',
].join(", ");

function shown(element: Element): boolean {
  return element.closest("[hidden]") === null && element.getClientRects().length > 0;
}

/** 画面の前に何も出ていないとき true。出たら false に戻る。最初は false（描き終わってから確かめる） */
export function useQuietScreen(): boolean {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const check = () => setQuiet(!Array.from(document.querySelectorAll(FOREGROUND)).some(shown));
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "data-envelope", "hidden", "aria-modal", "class"],
    });
    // カードや封筒は開いた直後の effect で出るので、少し待ってから確かめる
    const timer = setTimeout(check, 50);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return quiet;
}
