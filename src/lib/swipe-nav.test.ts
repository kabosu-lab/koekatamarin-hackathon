import { describe, expect, it } from "vitest";
import { swipeTarget } from "./swipe-nav";

describe("swipeTarget", () => {
  it("縦画面では左右で移動する", () => {
    expect(swipeTarget("/", -120, 4, false)).toBe("/minna");
    expect(swipeTarget("/", 120, 4, false)).toBe("/me");
    expect(swipeTarget("/minna", 120, 0, false)).toBe("/");
  });

  it("横画面では上下で移動する", () => {
    expect(swipeTarget("/", 0, -120, true)).toBe("/minna");
    expect(swipeTarget("/", 0, 120, true)).toBe("/me");
    expect(swipeTarget("/", -120, 0, true)).toBeNull();
  });

  it("短い動きや斜めの動きでは移動しない", () => {
    expect(swipeTarget("/", -30, 0, false)).toBeNull();
    expect(swipeTarget("/", -100, 90, false)).toBeNull();
  });

  it("端からさらに同じ向きへ動かすと、反対の端へ回る", () => {
    expect(swipeTarget("/me", 120, 0, false)).toBe("/minna");
    expect(swipeTarget("/minna", -120, 0, false)).toBe("/me");
  });

  it("並びにない画面では移動しない", () => {
    expect(swipeTarget("/inbox", -120, 0, false)).toBeNull();
  });
});
