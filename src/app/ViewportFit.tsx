"use client";

import { useEffect } from "react";
import "./viewport-fit.css";

/** これより見えている高さが縮んだら、キーボードが開いたと見なす（URL の帯の出し入れは数十 px） */
const KEYBOARD_GAP = 100;

/**
 * iPhone の Safari は、入力欄を押すと画面全体を上へずらして窓が切れる（0-2e）。
 * キーボードが開いている間は、見えている高さ（visualViewport）を --vvh に入れて画面をその高さに縮め、
 * Safari のずらしを戻す。入力欄はキーボードのすぐ上に来て、窓とパートナーは上に残る。
 * Android は viewport の interactive-widget=resizes-content で画面ごと縮むので、ここでは何も起きない。
 */
export function ViewportFit() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    const clear = () => {
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vv-top");
      delete root.dataset.keyboard;
    };

    const fit = () => {
      frame = 0;
      // 指で拡大しているときは、キーボードと取り違えない
      const zoomed = viewport.scale > 1.01;
      // iOS はキーボードが開いても innerHeight が縮まないことがあるので、html の高さとも比べる
      const full = Math.max(window.innerHeight, root.clientHeight);
      const open = !zoomed && full - viewport.height > KEYBOARD_GAP;
      if (open) {
        // 動かない1画面（話す画面・みんな）だけ、Safari のずらしを戻す。スクロールする画面は欄を見せるためにずらしたままにする
        const fixedScreen = !root.hasAttribute("data-embed") && document.querySelector(".retro-home") !== null;
        if (fixedScreen && (window.scrollY !== 0 || viewport.offsetTop !== 0)) window.scrollTo(0, 0);
        root.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
        root.style.setProperty("--vv-top", `${Math.round(fixedScreen ? 0 : viewport.offsetTop)}px`);
        root.dataset.keyboard = "open";
      } else if (root.dataset.keyboard) {
        clear();
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    fit();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, []);

  return null;
}
