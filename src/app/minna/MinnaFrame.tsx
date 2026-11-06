"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { bloomLine, bloomProgress, SAKURA_STORY, type Season, type TimeOfDay } from "@/lib/sakura";
import { SakuraScene } from "./SakuraScene";

/** 縮んだ帯の高さ（設計書 §2-2：48px） */
const BAND = 48;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 「みんな」の外枠（0-1k）。ページ全体が1つのスクロールで、桜は開いた直後は大きく、
 * スクロールすると細い帯に縮んで上に残る。帯の下にチャネルの札。iPad 横・PC は左に桜、右に投稿の2列。
 * 話すボタンとホイールは置かない。左右スワイプと下の点で「話す」へ戻れる。
 */
export function MinnaFrame({
  title,
  subtitle,
  season,
  time,
  leaves,
  grown,
  message,
  petals,
  fastForward,
  entrances,
  chips,
  children,
}: {
  title: string;
  subtitle: string;
  season: Season;
  time: TimeOfDay;
  leaves: number;
  /** この7日で増えた葉 */
  grown: number;
  message: string;
  petals: number;
  fastForward: boolean;
  /** 札の列の右端に置く入口（今日の3人、受信箱） */
  entrances: ReactNode;
  chips: ReactNode;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(leaves);
  const [shrunk, setShrunk] = useState(false);

  // 縮み：スクロール位置から p を1回だけ計算し、CSS の変数 --p を書くだけ（transform と opacity は CSS 側）
  useEffect(() => {
    const box = scroller.current;
    const scene = stage.current;
    if (!box || !scene) return;
    let frame = 0;
    let range = 1;
    let wide = false;
    let lastShrunk = false;
    const measure = () => {
      wide = getComputedStyle(box).display === "grid";
      range = Math.max(1, scene.offsetHeight - BAND);
      box.style.setProperty("--shrink", `${range}px`);
      if (wide) {
        box.style.setProperty("--p", "0");
        box.dataset.shrunk = "false";
        lastShrunk = false;
        setShrunk(false);
      }
    };
    const update = () => {
      frame = 0;
      if (wide) return;
      const p = Math.min(1, Math.max(0, box.scrollTop / range));
      if (!reducedMotion()) box.style.setProperty("--p", p.toFixed(3));
      const now = p >= 0.5;
      if (now !== lastShrunk) {
        lastShrunk = now;
        box.dataset.shrunk = String(now);
        setShrunk(now);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    update();
    box.addEventListener("scroll", onScroll, { passive: true });
    const resize = new ResizeObserver(() => {
      measure();
      update();
    });
    resize.observe(box);
    return () => {
      box.removeEventListener("scroll", onScroll);
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // 帯を押すと上に戻り、桜が大きく開く
  const openSakura = () => scroller.current?.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });

  const onCount = useCallback((count: number) => setShown(count), []);

  return (
    <main className="retro-home minna-page">
      <section ref={scroller} className="minna-scroll" aria-label={title} data-noswipe-landscape data-shrunk="false">
        <div ref={stage} className="minna-stage">
          <SakuraScene
            className="minna-scene"
            season={season}
            time={time}
            leaves={leaves}
            petals={petals}
            watchLeaves
            autoExplain
            fastForward={fastForward}
            onCount={onCount}
          >
            <header className="minna-title">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </header>
            {/* 0-1j(1)：一行の説明と、満開までの進み */}
            <div className="minna-sakura-caption">
              <p className="minna-sakura-story">{SAKURA_STORY}</p>
              <p className="minna-sakura-progress">
                <span className="minna-sakura-meter" aria-hidden="true">
                  <span style={{ transform: `scaleX(${bloomProgress(shown)})` }} />
                </span>
                <span className="minna-sakura-rest" key={shown}>
                  {bloomLine(shown)}
                </span>
              </p>
              <Link className="minna-sakura-link" href="/sakura">
                <strong>校内の桜</strong>
                <span>
                  {message}今週 {grown} 枚の葉が増えました（今年 {shown} 枚）
                </span>
              </Link>
            </div>
          </SakuraScene>
        </div>
        <div className="minna-column">
          <div className="minna-sticky">
            <button
              type="button"
              className="minna-band"
              aria-label="桜を大きく開く"
              tabIndex={shrunk ? 0 : -1}
              aria-hidden={!shrunk}
              onClick={openSakura}
            >
              <span aria-hidden="true">🌸</span> 葉{shown}枚・{bloomLine(shown).replace(" ", "")}
            </button>
            <div className="minna-chip-row">
              {chips}
              {entrances}
            </div>
          </div>
          <div className="minna-posts">{children}</div>
        </div>
      </section>
      <nav className="swipe-mark" aria-label="画面の切り替え">
        {/* 3枚は輪になっている。端の先は反対の端へ */}
        <Link href="/">‹ 話す</Link>
        <span className="swipe-dots" aria-hidden="true">
          <i />
          <i />
          <i data-current="" />
        </span>
        <Link href="/me">履歴と設定 ›</Link>
      </nav>
    </main>
  );
}
