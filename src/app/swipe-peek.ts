import { springSettled, springStep } from "@/lib/wheel-carousel";

/**
 * 0-2z の最小の形：スワイプの途中で、隣の画面をチラ見せする。
 * 指に1対1で付いて今の画面と隣の画面が動き、離すとホイールと同じばねで吸い付く。
 * 動きは rAF と transform だけ（React の state にしない）。
 *
 * 話す画面（ホーム）からは、裏で読み込んでおいた本物の左右の画面（WidePanel の pane）を覗かせる。
 * それ以外の画面からは、前にその画面を離れたときの写し（DOM の複製）を使う。まだ行ったことがなければ、外枠だけの姿を出す。
 */

/** 裏で読み込み終わった、その行き先の本物の画面（話す画面の左右の pane）。なければ null */
function livePane(target: string, side: -1 | 1): HTMLElement | null {
  const pane = document.querySelector<HTMLElement>(`.device-row > .wide-panel[data-mode="pane"][data-side="${side === 1 ? "right" : "left"}"]`);
  const frame = pane?.querySelector("iframe");
  if (!pane || !frame) return null;
  try {
    const inner = frame.contentWindow?.location;
    if (!inner || inner.pathname !== target || frame.contentDocument?.readyState !== "complete") return null;
  } catch {
    return null;
  }
  return pane;
}

const LABELS: Record<string, string> = { "/": "話す", "/me": "履歴と設定", "/minna": "みんな" };

/** 画面ごとの最後の姿。アプリを開いている間だけ覚える */
const snapshots = new Map<string, HTMLElement>();

/** 動かす画面。3枚は本体（.retro-home）ごと、奥の画面は main */
export const screenOf = () => document.querySelector<HTMLElement>(".retro-home") ?? document.querySelector<HTMLElement>("body > main, main");

/** 今の画面の姿を覚える。隣へ移るときに、次にこの画面へ戻るときのチラ見せに使う */
export function remember(pathname: string, screen: HTMLElement) {
  const copy = screen.cloneNode(true) as HTMLElement;
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("[id]")]) element.removeAttribute("id");
  copy.style.transform = "";
  copy.style.transition = "";
  copy.style.willChange = "";
  snapshots.set(pathname, copy);
}

export class Peek {
  readonly target: string;
  private readonly layer: HTMLElement;
  /** 本物の左右の画面を動かしているか（外すときは消さずに、画面の外の位置へ戻す） */
  private readonly live: boolean;
  private readonly screen: HTMLElement;
  /** 隣の画面が出てくる側（-1＝左から、1＝右から） */
  readonly side: -1 | 1;
  private readonly width: number;
  private frame = 0;

  constructor(target: string, side: -1 | 1, screen: HTMLElement) {
    this.target = target;
    this.side = side;
    this.screen = screen;
    this.width = window.innerWidth || 1;
    const pane = livePane(target, side);
    this.live = pane !== null;
    if (pane) {
      pane.classList.add("swipe-peek");
      pane.style.willChange = "transform";
      this.layer = pane;
      return;
    }
    const box = screen.getBoundingClientRect();
    const layer = document.createElement("div");
    layer.className = "swipe-peek";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    layer.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;z-index:40;pointer-events:none;will-change:transform;`;
    const snapshot = snapshots.get(target);
    if (snapshot) {
      const copy = snapshot.cloneNode(true) as HTMLElement;
      copy.style.width = "100%";
      copy.style.height = "100%";
      copy.style.margin = "0";
      layer.append(copy);
    } else {
      // まだ行ったことがない画面は、同じ本体の外枠と名前だけ
      const shell = document.createElement("div");
      shell.className = "swipe-peek-shell";
      shell.textContent = LABELS[target] ?? "";
      layer.append(shell);
    }
    document.body.append(layer);
    this.layer = layer;
  }

  /** 指の位置（px）。今の画面と隣の画面を、指に1対1で動かす */
  move(dx: number) {
    this.screen.style.transform = `translateX(${dx}px)`;
    this.layer.style.transform = `translateX(${this.side * this.width + dx}px)`;
  }

  /**
   * 離したあと、ばねで吸い付く。to＝-1/1 は隣の画面へ（払った向き）、0 は元の位置へ戻る。
   * velocity は離した瞬間の指の速さ（px/ms）。止まったら done を呼ぶ。
   */
  settle(dx: number, velocity: number, to: -1 | 0 | 1, done: () => void) {
    let x = dx / this.width;
    let v = (velocity * 1000) / this.width;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      ({ x, v } = springStep(x, v, to, dt));
      if (this.screen.isConnected) this.move(x * this.width);
      else this.layer.style.transform = `translateX(${(this.side + x) * this.width}px)`;
      if (springSettled(x, v, to)) {
        if (this.screen.isConnected) this.move(to * this.width);
        done();
        return;
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  remove() {
    cancelAnimationFrame(this.frame);
    if (!this.live) {
      this.layer.remove();
      return;
    }
    this.layer.classList.remove("swipe-peek");
    this.layer.style.transform = "";
    this.layer.style.willChange = "";
  }
}
