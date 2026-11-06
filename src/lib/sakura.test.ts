import { describe, expect, it } from "vitest";
import {
  bloomExplanation,
  bloomLine,
  bloomProgress,
  bloomShadow,
  CANOPY,
  FULL_BLOOM,
  fastForwardCounts,
  leafSlot,
  leavesToFullBloom,
  luminance,
  MAX_FLYING_LEAVES,
  newLeaves,
  SAKURA_STORY,
} from "./sakura";

describe("桜の意味（0-1j）", () => {
  it("満開までの残りと進みを出す", () => {
    expect(FULL_BLOOM).toBe(60);
    expect(leavesToFullBloom(49)).toBe(11);
    expect(leavesToFullBloom(0)).toBe(60);
    expect(leavesToFullBloom(75)).toBe(0);
    expect(leavesToFullBloom(-3)).toBe(60);
    expect(bloomProgress(30)).toBe(0.5);
    expect(bloomProgress(200)).toBe(1);
    expect(bloomProgress(-1)).toBe(0);
  });

  it("帯の言葉は「満開まで あとN枚」で、届いたら言い方を変える", () => {
    expect(bloomLine(49)).toBe("満開まで あと11枚");
    expect(bloomLine(60)).toBe("満開に届きました");
    expect(bloomLine(150)).toBe("夜桜も見られそう");
  });

  it("一行の説明は短く、スクロールなしで読める", () => {
    expect(SAKURA_STORY).toContain("葉");
    expect(SAKURA_STORY.length).toBeLessThanOrEqual(30);
  });

  it("春の見通しの説明は3行で、今の枚数と咲き方を言う", () => {
    const lines = bloomExplanation(49);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("49 枚");
    expect(lines[1]).toContain("きれい");
    expect(lines[2]).toContain("あと 11 枚");
    expect(bloomExplanation(80)[2]).toContain("満開に届きました");
    expect(bloomExplanation(3)[2]).toContain("枯れません");
  });

  it("前に見た枚数との差だけ葉を飛ばし、多いときは上限で止める", () => {
    expect(newLeaves(null, 49)).toEqual({ added: 0, flying: 0 });
    expect(newLeaves(49, 49)).toEqual({ added: 0, flying: 0 });
    expect(newLeaves(50, 49)).toEqual({ added: 0, flying: 0 });
    expect(newLeaves(48, 49)).toEqual({ added: 1, flying: 1 });
    expect(newLeaves(10, 30)).toEqual({ added: 20, flying: MAX_FLYING_LEAVES });
    expect(newLeaves(Number.NaN, 30)).toEqual({ added: 0, flying: 0 });
  });

  it("葉の着く場所は番号で決まり、樹冠の中に収まる", () => {
    expect(leafSlot(3)).toEqual(leafSlot(3));
    for (let i = 0; i < 80; i++) {
      const { x, y } = leafSlot(i);
      expect(x).toBeGreaterThanOrEqual(25);
      expect(x).toBeLessThanOrEqual(75);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(50);
    }
    expect(leafSlot(1)).not.toEqual(leafSlot(2));
  });

  it("花の影は、咲き方が大きいほど濃い", () => {
    expect(bloomShadow(5).opacity).toBeLessThan(bloomShadow(30).opacity);
    expect(bloomShadow(30).opacity).toBeLessThan(bloomShadow(70).opacity);
    expect(bloomShadow(70).opacity).toBeLessThanOrEqual(bloomShadow(160).opacity);
  });

  it("秋の葉は、夜の暗さを重ねても沈みすぎない明るさにする", () => {
    for (const color of CANOPY.aki) expect(luminance(color)).toBeGreaterThan(0.4);
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBe(1);
  });

  it("早回しは今の枚数から満開まで1枚ずつ数える", () => {
    expect(fastForwardCounts()).toHaveLength(61);
    expect(fastForwardCounts().at(-1)).toBe(FULL_BLOOM);
    expect(fastForwardCounts(55)).toEqual([55, 56, 57, 58, 59, 60]);
    expect(fastForwardCounts(90)).toEqual([60]);
  });
});
