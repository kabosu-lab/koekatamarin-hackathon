/**
 * 0-2b：履歴と設定のタイルは6枚（3列×2段）。並びはホイールのチップと同じ順。
 * 前の key（記録・話の履歴・collect・プロフィール・試用版）で来ても迷わないよう、行き先へ読み替える。
 * 画面に入口を増やすものではない（同じ入口を2か所に置かない）。
 */
export const ME_TILE_KEYS = ["daily", "lookback", "goals", "thanks", "partner", "settings"] as const;
export type MeTileKey = (typeof ME_TILE_KEYS)[number];

const LEGACY: Record<string, MeTileKey | null> = {
  // 数の帯はタイルの画面そのものにある
  records: null,
  // 話す画面の会話が読み返しを兼ねる
  talk: null,
  collect: "partner",
  profile: "settings",
  trial: "settings",
  portfolio: "lookback",
};

export function resolveOpenKey(requested: string | undefined): MeTileKey | null {
  if (requested === undefined) return null;
  if ((ME_TILE_KEYS as readonly string[]).includes(requested)) return requested as MeTileKey;
  return LEGACY[requested] ?? null;
}
