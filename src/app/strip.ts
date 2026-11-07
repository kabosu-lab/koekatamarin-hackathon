import { springSettled, springStep } from "@/lib/wheel-carousel";

/**
 * 0-2z：狭い画面の3つの画面（履歴と設定・話す・みんな）を、横に並べた1本の帯として動かす。
 * 帯は話す画面（/）の上だけにある。左右の画面は WidePanel が裏で読み込んだ本物の画面（pane）。
 *
 * 帯の位置は o で表す（画面の幅を 1 とする）。o = 0 で話す画面、-1 でみんな（右）、1 で履歴と設定（左）が見える。
 * 指で動かしている間とばねの間だけ transform を直接書き、止まったら .device-row の data-pane（CSS）に任せる。
 * 動きは rAF と transform だけで、React の state にしない。URL は history.replaceState で替える（読み込み直さない）。
 */

export type StripApi = {
  /** 帯を o の位置へ（指に付いて動かす） */
  drag(o: number): void;
  /** 離したあと、ばねで to へ吸い付く。v は離した瞬間の速さ（画面の幅／秒） */
  settle(from: number, v: number, to: -1 | 0 | 1): void;
  /** 今止まっている位置 */
  rest(): -1 | 0 | 1;
  /** 3つの画面の入口（/・/me・/minna）へのリンクなら、帯を動かして開く。動かしたら true */
  go(href: string): boolean;
};

declare global {
  interface Window {
    koekataStrip?: StripApi;
  }
}

const ROOTS = { left: "/me", right: "/minna" } as const;

const row = () => document.querySelector<HTMLElement>(".device-row");
const center = () => row()?.querySelector<HTMLElement>(":scope > .retro-home") ?? null;
const pane = (side: "left" | "right") =>
  row()?.querySelector<HTMLElement>(`:scope > .wide-panel[data-mode="pane"][data-side="${side}"]`) ?? null;

/** 左右の画面が両方とも読み込み終わり、帯として動かせるか */
export function stripReady(): boolean {
  for (const side of ["left", "right"] as const) {
    const frame = pane(side)?.querySelector("iframe");
    try {
      if (!frame || frame.contentDocument?.readyState !== "complete") return false;
    } catch {
      return false;
    }
  }
  return center() !== null;
}

export function stripRest(): -1 | 0 | 1 {
  const state = row()?.dataset.pane;
  return state === "right" ? -1 : state === "left" ? 1 : 0;
}

function parts() {
  return [
    [center(), 0],
    [pane("right"), 1],
    [pane("left"), -1],
  ] as const;
}

function apply(o: number) {
  const width = window.innerWidth || 1;
  for (const [element, base] of parts()) {
    if (!element) continue;
    element.style.willChange = "transform";
    element.style.transform = `translateX(${(base + o) * width}px)`;
  }
}

function clear() {
  for (const [element] of parts()) {
    if (!element) continue;
    element.style.transform = "";
    element.style.willChange = "";
  }
}

let frame = 0;

/** 止まった位置を CSS に任せ、URL を替える。話す画面へ戻ったときは、奥へ進んでいた左右の画面を入口へ戻す */
function land(to: -1 | 0 | 1) {
  const strip = row();
  if (!strip) return;
  if (to === -1) strip.dataset.pane = "right";
  else if (to === 1) strip.dataset.pane = "left";
  else delete strip.dataset.pane;
  clear();
  delete document.documentElement.dataset.swiping;
  history.replaceState(null, "", to === -1 ? ROOTS.right : to === 1 ? ROOTS.left : "/");
  if (to !== 0) return;
  for (const side of ["left", "right"] as const) {
    const inner = pane(side)?.querySelector("iframe");
    try {
      const location = inner?.contentWindow?.location;
      if (inner && location && location.pathname + location.search !== ROOTS[side]) location.replace(ROOTS[side]);
    } catch {
      // 読めなければそのまま
    }
  }
}

export const strip: StripApi = {
  drag(o) {
    cancelAnimationFrame(frame);
    document.documentElement.dataset.swiping = "true";
    apply(o);
  },
  settle(from, v, to) {
    cancelAnimationFrame(frame);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      land(to);
      return;
    }
    let x = from;
    let velocity = v;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      ({ x, v: velocity } = springStep(x, velocity, to, dt));
      apply(x);
      if (springSettled(x, velocity, to)) {
        land(to);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  },
  rest: stripRest,
  go(href) {
    const path = href.split(/[?#]/)[0];
    if (href !== path || !stripReady()) return false;
    const to = path === "/" ? 0 : path === ROOTS.left ? 1 : path === ROOTS.right ? -1 : null;
    // 今いる画面の入口へのリンク（奥の画面の「‹ みんな」など）は、その画面の中で戻る
    if (to === null || to === stripRest()) return false;
    strip.settle(stripRest(), 0, to);
    return true;
  },
};
