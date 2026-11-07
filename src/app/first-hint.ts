/**
 * 0-3i：初めて開いたときだけ見せる小さな手ほどき（つまみの棒の揺れ、輪をなぞる指の印）の印。
 * この端末のブラウザに残す（localStorage）。読めない・書けないときは、毎回は出さず、出さないことにする。
 */

export const EDGE_HINT_KEY = "koekata_hint_edge";
export const WHEEL_HINT_KEY = "koekata_hint_wheel";

/** 残せなかったときも、開いている間は「見せた」を覚えておく（同じページで二度見せない） */
const shownHere = new Set<string>();

/** まだ見せていないか。読めなければ見せない */
export function hintPending(key: string): boolean {
  if (shownHere.has(key)) return false;
  try {
    return window.localStorage.getItem(key) !== "1";
  } catch {
    return false;
  }
}

export function markHintSeen(key: string) {
  shownHere.add(key);
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
 * 落ち着くまで待ってから run する。取り消すときは戻り値を呼ぶ。
 * delayMs と limitMs は、最初に落ち着いた時刻から数える（最初の約束のカードや試用の注意を読んでいる間は数えない）。
 * 落ち着いているときに指やキーで触られたら、その回は見せない（触っている人の邪魔をしない）。
 * カードを閉じるタップのように、落ち着いていないときの触れでは取り消さない
 */
export function whenCalm(run: () => void, { delayMs, limitMs, ready = () => true }: { delayMs: number; limitMs: number; ready?: () => boolean }) {
  let began = 0;
  let timer = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("pointerdown", onTouch, true);
    document.removeEventListener("touchstart", onTouch, true);
    document.removeEventListener("keydown", onTouch, true);
  };
  const onTouch = () => {
    if (calm()) stop();
  };
  document.addEventListener("pointerdown", onTouch, true);
  document.addEventListener("touchstart", onTouch, true);
  document.addEventListener("keydown", onTouch, true);
  const check = () => {
    if (stopped) return;
    const isCalm = calm();
    if (!began && isCalm) began = performance.now();
    if (began && performance.now() - began > limitMs) return stop();
    if (began && performance.now() - began >= delayMs && ready() && isCalm) {
      stop();
      run();
      return;
    }
    timer = window.setTimeout(check, 200);
  };
  timer = window.setTimeout(check, 200);
  return stop;
}
