import { describe, expect, it } from "vitest";
import { nearestOnRing, ringRest } from "./strip";

describe("帯の輪（0-3j）", () => {
  it("輪の上の位置を -1・0・1 にそろえる", () => {
    expect(ringRest(-2)).toBe(1);
    expect(ringRest(2)).toBe(-1);
    expect(ringRest(-3)).toBe(0);
    expect(ringRest(3)).toBe(0);
    expect(ringRest(-1)).toBe(-1);
    expect(ringRest(1)).toBe(1);
    expect(ringRest(0)).toBe(0);
  });

  it("同じ向きに3回進むとホームに戻る", () => {
    let o = 0;
    for (let i = 0; i < 3; i++) o = ringRest(o - 1);
    expect(o).toBe(0);
    for (let i = 0; i < 3; i++) o = ringRest(o + 1);
    expect(o).toBe(0);
  });

  it("行き先へは輪の上で近い向きへ動く", () => {
    // みんな（-1）から履歴と設定（1）へは、さらに左（-2）へ
    expect(nearestOnRing(-1, 1)).toBe(-2);
    // 履歴と設定（1）からみんな（-1）へは、さらに右（2）へ
    expect(nearestOnRing(1, -1)).toBe(2);
    expect(nearestOnRing(0, -1)).toBe(-1);
    expect(nearestOnRing(-1, 0)).toBe(0);
  });
});
