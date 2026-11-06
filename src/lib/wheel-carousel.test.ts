import { describe, expect, it } from "vitest";
import {
  clicksBetween,
  isCancelPoint,
  layoutOf,
  shownPos,
  slotTarget,
  snapTarget,
  springSettled,
  springStep,
  wrapIndex,
} from "./wheel-carousel";

describe("wrapIndex", () => {
  it("項目は輪でつながり、端で止まらない", () => {
    expect(wrapIndex(0, 7)).toBe(0);
    expect(wrapIndex(7, 7)).toBe(0);
    expect(wrapIndex(-1, 7)).toBe(6);
    expect(wrapIndex(-15, 7)).toBe(6);
    expect(wrapIndex(23, 7)).toBe(2);
  });
  it("項目がなくても壊れない", () => {
    expect(wrapIndex(3, 0)).toBe(0);
  });
});

describe("layoutOf", () => {
  it("真ん中はほかよりはっきり大きく明るく、光る", () => {
    const c = layoutOf(0);
    expect(c).toMatchObject({ x: 0, y: 0, scale: 1.16, opacity: 1, center: true });
  });
  it("隣は小さく少し暗く、その外はさらに小さい", () => {
    const right = layoutOf(1);
    expect(right.x).toBe(96);
    expect(right.scale).toBeCloseTo(0.72);
    expect(right.opacity).toBeCloseTo(0.55);
    expect(right.center).toBe(false);
    const far = layoutOf(-2);
    expect(far.x).toBe(-192);
    expect(far.scale).toBeCloseTo(0.58);
    expect(far.opacity).toBeCloseTo(0.35);
    expect(far.y).toBe(40);
  });
  it("左右は対称で、弧に沿って傾く", () => {
    expect(layoutOf(-1).x).toBe(-layoutOf(1).x);
    expect(layoutOf(-1).y).toBe(layoutOf(1).y);
    expect(layoutOf(1).rotate).toBe(-4);
    expect(layoutOf(-1).rotate).toBe(4);
  });
  it("2.5枚より外は見えない（中身を入れ替えてもちらつかない）", () => {
    expect(layoutOf(2.5).opacity).toBe(0);
    expect(layoutOf(-2.5).opacity).toBe(0);
    expect(layoutOf(2.25).opacity).toBeGreaterThan(0);
  });
  it("真ん中の光は半枚より内側だけ", () => {
    expect(layoutOf(0.49).center).toBe(true);
    expect(layoutOf(0.5).center).toBe(false);
  });
});

describe("shownPos", () => {
  it("刻みの上ではそのまま", () => {
    expect(shownPos(3)).toBe(3);
  });
  it("刻みへ少し引き寄せる", () => {
    expect(shownPos(0.3)).toBeCloseTo(0.3 - 0.18 * 0.3);
    expect(shownPos(0.7)).toBeCloseTo(0.7 + 0.18 * 0.3);
  });
});

describe("snapTarget", () => {
  it("ゆっくり離すと、その場の最寄りに止まる", () => {
    expect(snapTarget(2.4, 0)).toBe(2);
    expect(snapTarget(2.6, 0.001)).toBe(3);
    expect(snapTarget(-1.6, -0.003)).toBe(-2);
  });
  it("速く離すと、滑った先の最寄りに止まる", () => {
    // 0.005 枚/ms → 16ms×0.005/0.08 = 1枚ほど滑る
    expect(snapTarget(0, 0.005)).toBe(1);
    expect(snapTarget(0, -0.005)).toBe(-1);
  });
  it("どんなに速くても4枚まで", () => {
    expect(snapTarget(0.2, 1)).toBe(4);
    expect(snapTarget(0.2, -1)).toBe(-4);
  });
  it("おかしな速さでは、その場で止まる", () => {
    expect(snapTarget(1.2, Number.NaN)).toBe(1);
  });
});

describe("clicksBetween", () => {
  it("刻みを越えた数だけカリを鳴らす", () => {
    expect(clicksBetween(0.2, 0.4)).toBe(0);
    expect(clicksBetween(0.4, 0.6)).toBe(1);
    expect(clicksBetween(0.6, -0.6)).toBe(2);
  });
  it("1コマに3回より多くは鳴らさない", () => {
    expect(clicksBetween(0, 10)).toBe(3);
  });
});

describe("slotTarget", () => {
  it("5枚で真ん中 ±2 をすき間なく覆う", () => {
    for (const pos of [0, 0.4, 0.6, 3, -2.3, 17.5]) {
      const shown = [0, 1, 2, 3, 4].map((slot) => slotTarget(slot, pos)).sort((a, b) => a - b);
      const base = Math.round(pos);
      expect(shown).toEqual([base - 2, base - 1, base, base + 1, base + 2]);
    }
  });
  it("同じ DOM は 5 で割った余りが同じ番号だけを受け持つ", () => {
    for (const pos of [0, 1, 2, -3, 8]) {
      for (let slot = 0; slot < 5; slot++) {
        expect(wrapIndex(slotTarget(slot, pos), 5)).toBe(slot);
      }
    }
  });
  it("1枚進むと、入れ替わるのは見えない端の1枚だけ", () => {
    const before = [0, 1, 2, 3, 4].map((slot) => slotTarget(slot, 0));
    const after = [0, 1, 2, 3, 4].map((slot) => slotTarget(slot, 1));
    const changed = before.filter((v, i) => v !== after[i]);
    expect(changed).toEqual([-2]);
  });
});

describe("springStep", () => {
  it("目標へ寄り、ほとんど行き過ぎずに止まる", () => {
    let x = 0;
    let v = 0;
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      ({ x, v } = springStep(x, v, 1, 1 / 60));
      peak = Math.max(peak, x);
    }
    expect(x).toBeCloseTo(1, 2);
    expect(peak).toBeLessThan(1.05);
    expect(springSettled(x, v, 1)).toBe(true);
  });
  it("大きなコマ落ちでも暴れない", () => {
    const { x } = springStep(0, 0, 1, 0.5);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x - 1)).toBeLessThan(0.2);
  });
});

describe("isCancelPoint", () => {
  const wheel = 100;
  const mic = 40;
  it("輪の上で離すと開く", () => {
    expect(isCancelPoint(80, 0, wheel, mic)).toBe(false);
    expect(isCancelPoint(0, -110, wheel, mic)).toBe(false);
  });
  it("輪の外（1.15倍より外）で離すとやめる", () => {
    expect(isCancelPoint(0, 116, wheel, mic)).toBe(true);
    expect(isCancelPoint(90, 90, wheel, mic)).toBe(true);
  });
  it("真ん中のマイクの上で離すとやめる", () => {
    expect(isCancelPoint(10, 10, wheel, mic)).toBe(true);
  });
});
