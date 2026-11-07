/**
 * 0-3i：初めて開いたときだけ見せる小さな手ほどき（つまみの棒の揺れ、輪をなぞる指の印）の印。
 * この端末のブラウザに残す（localStorage）。読めない・書けないときは、毎回は出さず、出さないことにする。
 */

export const EDGE_HINT_KEY = "koekata_hint_edge";
export const WHEEL_HINT_KEY = "koekata_hint_wheel";

/** まだ見せていないか。読めなければ見せない */
export function hintPending(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "1";
  } catch {
    return false;
  }
}

export function markHintSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // 残せなくても動く
  }
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 手ほどきを見せてよい落ち着いた状態か（最初の約束のカード・届いたカード・帯の動きの途中ではない、見えている） */
export function calm(): boolean {
  const root = document.documentElement;
  if (document.visibilityState !== "visible" || root.dataset.swiping === "true") return false;
  // 閉じている下のシート（hidden・inert の中）は数えない
  const open = [...document.querySelectorAll(".first-card-backdrop, dialog[open], [role='dialog']")].some(
    (element) => !element.closest("[hidden], [inert]") && element.getClientRects().length > 0,
  );
  return !open;
}

/**
 * 落ち着くまで待ってから run する。待てるのは limitMs まで。取り消すときは戻り値を呼ぶ。
 * 指やキーで触られたら、その回は見せない（触っている人の邪魔をしない）
 */
export function whenCalm(run: () => void, { delayMs, limitMs, ready = () => true }: { delayMs: number; limitMs: number; ready?: () => boolean }) {
  const began = performance.now();
  let timer = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("touchstart", stop, true);
    document.removeEventListener("keydown", stop, true);
  };
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("touchstart", stop, true);
  document.addEventListener("keydown", stop, true);
  const check = () => {
    if (stopped) return;
    if (performance.now() - began > limitMs) return stop();
    if (performance.now() - began >= delayMs && ready() && calm()) {
      stop();
      run();
      return;
    }
    timer = window.setTimeout(check, 200);
  };
  timer = window.setTimeout(check, 200);
  return stop;
}
