/**
 * 0-2b 第2段：「これまで」の帯の数。前に見たときから増えた数字だけが転がる。
 * 上の段は動いた数、下の段は人の役に立った数（節目の言葉を付けてよいのは下の段だけ）。
 */
export const SO_FAR_ITEMS = [
  { key: "posts", label: "届けた", helped: false },
  { key: "comments", label: "返した", helped: false },
  { key: "cheers", label: "応援した", helped: false },
  { key: "goals", label: "解決", helped: true },
  { key: "assists", label: "つないだ", helped: true },
  { key: "thanks", label: "ありがとう", helped: true },
] as const;

export type SoFarKey = (typeof SO_FAR_ITEMS)[number]["key"];
export type SoFarCounts = Record<SoFarKey, number>;

/** 1つの転がりの長さと、複数のときのずらし（設計書：標準 600ms、80ms ずつ） */
export const ROLL_MS = 600;
export const ROLL_STAGGER_MS = 80;

export type Roll = { key: SoFarKey; from: number; to: number; delay: number; step: number };

export type RollPlan = {
  rolls: Roll[];
  /** 下の段（人の役に立った数）が増えたか。増えたら最後に「届いた」の音 */
  helpedRose: boolean;
};

/** 前回値との差から、転がる数を決める。前回値がない（初めて見た）ときは何も動かさない */
export function planRoll(previous: SoFarCounts | null, next: SoFarCounts): RollPlan {
  if (!previous) return { rolls: [], helpedRose: false };
  const rolls: Roll[] = [];
  let helpedRose = false;
  for (const item of SO_FAR_ITEMS) {
    const from = previous[item.key];
    const to = next[item.key];
    if (typeof from !== "number" || !(to > from)) continue;
    rolls.push({ key: item.key, from, to, delay: rolls.length * ROLL_STAGGER_MS, step: rolls.length + 1 });
    if (item.helped) helpedRose = true;
  }
  return { rolls, helpedRose };
}

/**
 * 桁ごとの、0〜9 の帯の動き。to の桁数にそろえ、from の短い分は 0 から転がる。
 * 変わらない桁は動かさない（rolling: false）。
 */
export function digitColumns(from: number, to: number): { from: number; to: number; rolling: boolean }[] {
  const target = String(Math.max(0, Math.floor(to)));
  const start = String(Math.max(0, Math.floor(from))).padStart(target.length, "0").slice(-target.length);
  return [...target].map((digit, index) => {
    const end = Number(digit);
    const begin = Number(start[index]);
    return { from: begin, to: end, rolling: begin !== end };
  });
}

/** sessionStorage に置いた前回値を読む。壊れていれば無かったことにする */
export function parseCounts(raw: string | null): SoFarCounts | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const counts = {} as SoFarCounts;
    for (const item of SO_FAR_ITEMS) {
      const n = value[item.key];
      if (typeof n !== "number" || !Number.isFinite(n)) return null;
      counts[item.key] = n;
    }
    return counts;
  } catch {
    return null;
  }
}
