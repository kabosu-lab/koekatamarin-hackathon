/** スワイプで行き来する3枚。指を右へ動かすと履歴と設定、左へ動かすとみんな。端から先は反対の端へ回る。 */
export const SWIPE_SCREENS = ["/me", "/", "/minna"] as const;

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
  // 端からさらに同じ向きへ動かすと、反対の端へ回る（3枚がつながった輪）
  const count = SWIPE_SCREENS.length;
  return SWIPE_SCREENS[(index + (along < 0 ? 1 : -1) + count) % count];
}
