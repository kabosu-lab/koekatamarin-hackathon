/** スワイプで行き来する3枚。指を右へ動かすと履歴と設定、左へ動かすとみんな。端から先は反対の端へ回る。 */
export const SWIPE_SCREENS = ["/me", "/", "/minna"] as const;
/** 奥の画面から、左右どちらへ払っても戻る先（0-2p） */
export const SWIPE_HOME = "/";

const MIN_DISTANCE = 56;
/** 斜めの動きやスクロールを、画面の移動と間違えない */
const DOMINANCE = 1.6;

const isScreen = (pathname: string) => (SWIPE_SCREENS as readonly string[]).includes(pathname);

/** 3枚のどれでもない画面か、3枚の上で奥の状態（タイルを開いた、今日の3人を出した）を開いているか */
export function isDeep(pathname: string, deepState = false): boolean {
  return deepState || !isScreen(pathname);
}

/**
 * 指の動きから、次に開く画面を決める。動かないときは null。
 * 3枚の上では、縦画面は左右、横画面は上下で移動する。指を左か上へ動かすと、次の画面へ進む。
 * 奥の画面（deep）では、縦でも横でも、左右どちらへ払ってもホームへ戻る（0-2p）。
 */
export function swipeTarget(pathname: string, dx: number, dy: number, landscape: boolean, deepState = false): string | null {
  if (isDeep(pathname, deepState)) {
    if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * DOMINANCE) return null;
    return SWIPE_HOME;
  }
  const index = SWIPE_SCREENS.indexOf(pathname as (typeof SWIPE_SCREENS)[number]);
  const along = landscape ? dy : dx;
  const across = landscape ? dx : dy;
  if (Math.abs(along) < MIN_DISTANCE || Math.abs(along) < Math.abs(across) * DOMINANCE) return null;
  // 端からさらに同じ向きへ動かすと、反対の端へ回る（3枚がつながった輪）
  const count = SWIPE_SCREENS.length;
  return SWIPE_SCREENS[(index + (along < 0 ? 1 : -1) + count) % count];
}
