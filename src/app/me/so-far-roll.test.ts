import { describe, expect, it } from "vitest";
import { digitColumns, parseCounts, planRoll, type SoFarCounts } from "./so-far-roll";

const base: SoFarCounts = { posts: 13, comments: 4, cheers: 6, goals: 2, assists: 0, thanks: 3 };

describe("「これまで」の帯の転がり", () => {
  it("初めて見たときは何も転がらない", () => {
    expect(planRoll(null, base)).toEqual({ rolls: [], helpedRose: false });
  });

  it("増えていなければ転がらない。減ったときも転がらない", () => {
    expect(planRoll(base, base).rolls).toEqual([]);
    expect(planRoll(base, { ...base, posts: 12 }).rolls).toEqual([]);
  });

  it("増えた数だけが、並びの順に 80ms ずつずれて転がり、ポンの段が1つずつ上がる", () => {
    const plan = planRoll(base, { ...base, comments: 5, goals: 3 });
    expect(plan.rolls).toEqual([
      { key: "comments", from: 4, to: 5, delay: 0, step: 1 },
      { key: "goals", from: 2, to: 3, delay: 80, step: 2 },
    ]);
    expect(plan.helpedRose).toBe(true);
  });

  it("上の段（動いた数）だけが増えたときは、届いたの音を鳴らさない", () => {
    expect(planRoll(base, { ...base, posts: 14, cheers: 7 }).helpedRose).toBe(false);
  });

  it("桁ごとの帯は、変わった桁だけが動く", () => {
    expect(digitColumns(13, 14)).toEqual([
      { from: 1, to: 1, rolling: false },
      { from: 3, to: 4, rolling: true },
    ]);
    expect(digitColumns(9, 10)).toEqual([
      { from: 0, to: 1, rolling: true },
      { from: 9, to: 0, rolling: true },
    ]);
  });

  it("前回値が壊れていれば、無かったことにする", () => {
    expect(parseCounts(null)).toBeNull();
    expect(parseCounts("{")).toBeNull();
    expect(parseCounts(JSON.stringify({ posts: 1 }))).toBeNull();
    expect(parseCounts(JSON.stringify(base))).toEqual(base);
  });
});
