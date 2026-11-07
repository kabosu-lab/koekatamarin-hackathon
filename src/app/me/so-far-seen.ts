/**
 * 0-2t：「これまで」のインフォグラフィックで、前に見たときから増えた項目だけを動かすための計算。
 * 前に見た値は端末ごと（localStorage）に、数と人の ID だけを覚える（言葉は残さない）。
 */
import type { SoFarStory } from "@/lib/so-far";

export const SEEN_VERSION = 1;

export type SeenCounts = SoFarStory["counts"];

export type Seen = {
  v: typeof SEEN_VERSION;
  counts: SeenCounts;
  /** 届いた日の数 */
  days: number;
  /** つながった人の ID（最大8人） */
  people: string[];
  leaves: number;
  trophies: number;
};

export type Growth = { from: number; to: number; grew: boolean };

export type StoryPlan = {
  counts: Record<keyof SeenCounts, Growth>;
  days: Growth;
  leaves: Growth;
  trophies: Growth;
  /** 新しくつながった人 */
  newPeople: Set<string>;
  /** どれか1つでも増えたか */
  any: boolean;
};

const COUNT_KEYS: (keyof SeenCounts)[] = ["posts", "comments", "cheers", "goals", "assists", "thanks"];

export const seenKey = (personId: string) => `so-far-story:${personId}`;

export function daysOf(story: SoFarStory): number {
  return story.reachedDays.length;
}

export function seenOf(story: SoFarStory): Seen {
  return {
    v: SEEN_VERSION,
    counts: { ...story.counts },
    days: daysOf(story),
    people: story.people.map((person) => person.id),
    leaves: story.leaves,
    trophies: story.trophies.length,
  };
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** 覚えていた値を読む。壊れていれば「初めて見る」とする */
export function parseSeen(raw: string | null): Seen | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Seen> | null;
    if (!value || value.v !== SEEN_VERSION || typeof value.counts !== "object" || !value.counts) return null;
    const counts = {} as SeenCounts;
    for (const key of COUNT_KEYS) {
      const n = (value.counts as Record<string, unknown>)[key];
      if (!isCount(n)) return null;
      counts[key] = n;
    }
    if (![value.days, value.leaves, value.trophies].every(isCount)) return null;
    if (!Array.isArray(value.people) || !value.people.every((id) => typeof id === "string")) return null;
    return {
      v: SEEN_VERSION,
      counts,
      days: value.days!,
      people: value.people,
      leaves: value.leaves!,
      trophies: value.trophies!,
    };
  } catch {
    return null;
  }
}

function grow(from: number, to: number): Growth {
  // 減ったとき（消した投稿など）は動かさず、今の値で出す
  return to > from ? { from, to, grew: true } : { from: to, to, grew: false };
}

/** 前に見た値（なければ全部 0）から、今の値までの動きを決める */
export function planStory(previous: Seen | null, story: SoFarStory): StoryPlan {
  const now = seenOf(story);
  const before: Seen = previous ?? {
    v: SEEN_VERSION,
    counts: { posts: 0, comments: 0, cheers: 0, goals: 0, assists: 0, thanks: 0 },
    days: 0,
    people: [],
    leaves: 0,
    trophies: 0,
  };
  const counts = {} as StoryPlan["counts"];
  for (const key of COUNT_KEYS) counts[key] = grow(before.counts[key], now.counts[key]);
  const known = new Set(before.people);
  const newPeople = new Set(now.people.filter((id) => !known.has(id)));
  const plan = {
    counts,
    days: grow(before.days, now.days),
    leaves: grow(before.leaves, now.leaves),
    trophies: grow(before.trophies, now.trophies),
    newPeople,
  };
  const any =
    COUNT_KEYS.some((key) => counts[key].grew) ||
    plan.days.grew ||
    plan.leaves.grew ||
    plan.trophies.grew ||
    newPeople.size > 0;
  return { ...plan, any };
}
