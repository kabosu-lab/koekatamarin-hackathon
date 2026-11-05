import { describe, expect, it } from "vitest";
import { nextLength } from "./use-smooth-text";

describe("聞き取りの文字をなめらかに出す", () => {
  it("少しずつ増やし、遅れが大きいほど速く追いつき、行き過ぎない", () => {
    expect(nextLength(0, 3)).toBe(1);
    expect(nextLength(0, 60)).toBe(10);
    expect(nextLength(58, 60)).toBe(59);
    expect(nextLength(60, 60)).toBe(60);
    expect(nextLength(70, 60)).toBe(60);
  });
});
