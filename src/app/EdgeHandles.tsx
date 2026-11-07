"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isDeep, SWIPE_HOME, swipeTarget } from "@/lib/swipe-nav";
import { WIDE_QUERY } from "@/lib/wide";
import { EDGE_HINT_KEY, hintPending, markHintSeen, reducedMotion, whenCalm } from "./first-hint";
import { STRIP_LAND_EVENT, stripReady } from "./strip";
import { DEEP_STATE } from "./SwipeNav";

const LABELS: Record<string, string> = { "/": "話す画面", "/me": "履歴と設定", "/minna": "みんな" };
const PANE_ROOTS = { left: "/me", right: "/minna" } as const;

type Where = { path: string; deep: boolean; doc: Document | null; rest: -1 | 0 | 1 | null };

/**
 * 今見えている画面。話す画面の帯（0-2z）の上では、止まっている位置の画面（左右の画面なら iframe の中）を見る。
 * deep は奥の画面か、3枚の上で奥の状態（タイルを開いたなど）を開いているか（0-2p）
 */
function where(): Where {
  const strip = window.koekataStrip;
  if (location.pathname === SWIPE_HOME && strip && document.querySelector(".device-row")) {
    const rest = strip.rest();
    if (rest === 0) return { path: SWIPE_HOME, deep: isDeep(SWIPE_HOME, document.querySelector(DEEP_STATE) !== null), doc: document, rest };
    const side = rest === -1 ? "right" : "left";
    const frame = document.querySelector<HTMLIFrameElement>(`.device-row > .wide-panel[data-mode="pane"][data-side="${side}"] iframe`);
    try {
      const inner = frame?.contentDocument;
      const path = frame?.contentWindow?.location.pathname;
      if (inner && path && path !== "blank") return { path, deep: isDeep(path, inner.querySelector(DEEP_STATE) !== null), doc: inner, rest };
    } catch {
      // 読めなければ入口として扱う
    }
    return { path: PANE_ROOTS[side], deep: false, doc: document, rest };
  }
  return { path: location.pathname, deep: isDeep(location.pathname, document.querySelector(DEEP_STATE) !== null), doc: document, rest: null };
}

/** 押したときの行き先。3枚の上では輪の隣（0-3j）、奥の画面では左右どちらでも話す画面（0-2p） */
function targetOf(side: "left" | "right", at: Pick<Where, "path" | "deep">): string {
  return swipeTarget(at.path, side === "left" ? 1000 : -1000, 0, false, at.deep) ?? SWIPE_HOME;
}

function labelOf(path: string): string {
  return LABELS[path] ?? LABELS[SWIPE_HOME];
}

function labelsAt(at: Pick<Where, "path" | "deep">) {
  return { left: labelOf(targetOf("left", at)), right: labelOf(targetOf("right", at)) };
}

/** 開いているシートやモーダルを閉じる（どれも Escape で閉じる） */
function closeOverlays(doc: Document | null) {
  if (!doc) return;
  const open = [...doc.querySelectorAll(".bottom-sheet[data-state='open'], [role='dialog'], dialog[open]")].some(
    (element) => !element.closest("[hidden], [inert]") && element.getClientRects().length > 0,
  );
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!open || !view) return;
  doc.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

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
 * 0-3i・0-3o：画面の左右の端、上下のまん中に置く、縦向きのつまみの棒（ホームバーを縦にした形）。
 * 狭い画面のすべてのページに、共通の外枠（layout.tsx）から1か所で出す。3列と欄（iframe）の中では CSS で出さない。
 * 押すと、3枚の上では輪の隣へ（0-3j）、奥の画面では左右どちらでも話す画面へ（0-2p）移る。
 * 話す画面の帯の上では帯を動かし（読み込み直さない）、それ以外は画面を開く。シートやモーダルの上でも押せ、押すと閉じてから移る。
 * つまんで引く動きは SwipeNav の指の動きがそのまま受ける。
 *
 * 初めて開いたときだけ（話す画面で）、棒が一度外へ揺れ、帯をばねで少しだけ動かして隣の画面の端を見せて戻す（右、次に左）。
 */
export function EdgeHandles() {
  const pathname = usePathname();
  const router = useRouter();
  const [nudge, setNudge] = useState(false);
  const [labels, setLabels] = useState(() => labelsAt({ path: pathname, deep: isDeep(pathname) }));

  // 名前（aria-label）は、今見えている画面に合わせる（帯の位置や、奥の状態を開いたかで変わる）
  useEffect(() => {
    if (window.self !== window.top) return;
    const update = () => {
      const next = labelsAt(where());
      setLabels((current) => (current.left === next.left && current.right === next.right ? current : next));
    };
    update();
    const timer = window.setInterval(update, 500);
    window.addEventListener(STRIP_LAND_EVENT, update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(STRIP_LAND_EVENT, update);
    };
  }, [pathname]);

  const go = (side: "left" | "right") => {
    const at = where();
    const target = targetOf(side, at);
    closeOverlays(at.doc);
    const strip = window.koekataStrip;
    if (at.rest !== null && strip && stripReady()) {
      // 帯の上：輪の隣へ。奥の画面からは話す画面へ
      const to = at.deep ? 0 : at.rest + (side === "left" ? 1 : -1);
      if (to !== at.rest) {
        strip.settle(at.rest, 0, to);
        return;
      }
    }
    router.push(target);
  };

  useEffect(() => {
    if (pathname !== SWIPE_HOME) return;
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
    let stopFallback = () => {};
    const fallback = window.setTimeout(() => {
      // 帯が整っていれば、覗きのある本線に任せる（約束のカードを読んでいる間など）
      if (cancelled || root.dataset.edgeHint || root.dataset.stripReady === "true") return;
      stop();
      stopFallback = whenCalm(
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
      stopFallback();
      window.clearTimeout(fallback);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          className="edge-handle"
          data-side={side}
          data-nudge={nudge || undefined}
          aria-label={`${labels[side]}へ`}
          onClick={() => go(side)}
        >
          <span className="edge-handle-bar" aria-hidden="true" />
        </button>
      ))}
    </>
  );
}
