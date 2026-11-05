/** スワイプで行き来する画面の並び。話す画面から、右へ戻るとログ、左へ進むとみんな、じぶん。 */
export const SWIPE_SCREENS = ["/log", "/", "/minna", "/me"] as const;

const MIN_DISTANCE = 56;
/** 斜めの動きやスクロールを、画面の移動と間違えない */
const DOMINANCE = 1.6;

/**
 * 指の動きから、次に開く画面を決める。動かないときは null。
 * 縦画面は左右、横画面は上下で移動する。指を左か上へ動かすと、次の画面へ進む。
 */
export function swipeTarget(pathname: string, dx: number, dy: number, landscape: boolean): string | null {
  const index = SWIPE_SCREENS.indexOf(pathname as (typeof SWIPE_SCREENS)[number]);
  if (index < 0) return null;
  const along = landscape ? dy : dx;
  const across = landscape ? dx : dy;
  if (Math.abs(along) < MIN_DISTANCE || Math.abs(along) < Math.abs(across) * DOMINANCE) return null;
  return SWIPE_SCREENS[index + (along < 0 ? 1 : -1)] ?? null;
}
