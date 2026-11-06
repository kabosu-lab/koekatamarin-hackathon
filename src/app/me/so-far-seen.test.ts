import { describe, expect, it } from "vitest";
import type { SoFarStory } from "@/lib/so-far";
import { parseSeen, planStory, seenOf } from "./so-far-seen";

const story = {
  counts: { posts: 13, comments: 4, cheers: 6, goals: 2, assists: 0, thanks: 3 },
  reachedDays: ["2026-11-02", "2026-11-05"],
  people: [
    { id: "p1", name: "一" },
    { id: "p2", name: "二" },
  ],
  leaves: 9,
  trophies: ["はじめの一歩"],
  words: [{ from: "一", text: "ありがとう" }],
} as unknown as SoFarStory;

describe("「これまで」のインフォグラフィックの動き（0-2t）", () => {
  it("初めて見るときは、0 でない項目が全部 0 から伸びる。0 の項目は動かない", () => {
    const plan = planStory(null, story);
    expect(plan.counts.posts).toEqual({ from: 0, to: 13, grew: true });
    expect(plan.counts.assists).toEqual({ from: 0, to: 0, grew: false });
    expect(plan.days).toEqual({ from: 0, to: 2, grew: true });
    expect([...plan.newPeople]).toEqual(["p1", "p2"]);
    expect(plan.any).toBe(true);
  });

  it("前と同じなら、何も動かない", () => {
    const plan = planStory(seenOf(story), story);
    expect(plan.any).toBe(false);
    expect(Object.values(plan.counts).every((g) => !g.grew)).toBe(true);
    expect(plan.newPeople.size).toBe(0);
  });

  it("増えた項目だけ、前の値から伸びる", () => {
    const before = seenOf(story);
    const after = {
      ...story,
      counts: { ...story.counts, posts: 14 },
      people: [{ id: "p3", name: "三" }, ...story.people],
    } as SoFarStory;
    const plan = planStory(before, after);
    expect(plan.counts.posts).toEqual({ from: 13, to: 14, grew: true });
    expect(plan.counts.comments.grew).toBe(false);
    expect(plan.days.grew).toBe(false);
    expect([...plan.newPeople]).toEqual(["p3"]);
  });

  it("減ったときは動かさず、今の値で出す", () => {
    const before = seenOf({ ...story, counts: { ...story.counts, posts: 20 } } as SoFarStory);
    expect(planStory(before, story).counts.posts).toEqual({ from: 13, to: 13, grew: false });
  });

  it("覚えていた値が壊れていれば、初めて見るとする", () => {
    expect(parseSeen(null)).toBeNull();
    expect(parseSeen("{")).toBeNull();
    expect(parseSeen(JSON.stringify({ v: 1, counts: { posts: "x" } }))).toBeNull();
    expect(parseSeen(JSON.stringify(seenOf(story)))).toEqual(seenOf(story));
  });
});
