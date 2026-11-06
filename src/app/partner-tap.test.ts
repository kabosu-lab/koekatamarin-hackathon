import { describe, expect, it } from "vitest";
import { countRapid, DIZZY_TAPS, nextReaction, RAPID_GAP_MS, TAP_REACTIONS, type TapReaction } from "./partner-tap";

describe("パートナーをタップしたときの動き（0-2a）", () => {
  it("同じ動きが続かず、4つの動きがどれも出る", () => {
    let previous: TapReaction | null = null;
    const seen = new Set<TapReaction>();
    for (let i = 0; i < 40; i++) {
      const next = nextReaction(previous, i);
      expect(next).not.toBe(previous);
      seen.add(next);
      previous = next;
    }
    expect([...seen].sort()).toEqual([...TAP_REACTIONS].sort());
  });

  it("1周ごとに順番が少し変わる", () => {
    const firstRound = [0, 1, 2, 3].map((i) => nextReaction(null, i));
    const secondRound = [4, 5, 6, 7].map((i) => nextReaction(null, i));
    expect(secondRound).not.toEqual(firstRound);
  });

  it("続けて何度も押したときだけ、目を回す（1回だけ）", () => {
    expect(nextReaction("bounce", 5, DIZZY_TAPS)).toBe("dizzy");
    expect(nextReaction("dizzy", 6, DIZZY_TAPS + 1)).not.toBe("dizzy");
    for (let rapid = 1; rapid < DIZZY_TAPS; rapid++) expect(nextReaction(null, rapid, rapid)).not.toBe("dizzy");
  });

  it("続けて押した回数を数える", () => {
    expect(countRapid(null, 1000, 0)).toBe(1);
    expect(countRapid(1000, 1000 + RAPID_GAP_MS, 3)).toBe(4);
    expect(countRapid(1000, 1001 + RAPID_GAP_MS, 3)).toBe(1);
  });
});
