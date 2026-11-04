import { describe, expect, it } from "vitest";
import { aizuchiAt, detectCommand, withoutEndWord } from "./walk-command";

describe("detectCommand", () => {
  it("区切りのあとの「終わり」で止まる", () => {
    expect(detectCommand("今日はよく歩いた。終わり")).toBe("end");
    expect(detectCommand("おわり")).toBe("end");
    expect(detectCommand("今日はよく歩いた おしまい。")).toBe("end");
  });

  it("文の一部の「終わり」では止まらない", () => {
    expect(detectCommand("今日で文化祭も終わり")).toBeNull();
    expect(detectCommand("終わりが見えない話でね")).toBeNull();
  });

  it("頼んだときだけ Claude を呼ぶ", () => {
    expect(detectCommand("これ、どう思う？")).toBe("ask");
    expect(detectCommand("小テストの作り方を調べて")).toBe("ask");
    expect(detectCommand("ちょっと壁打ちして")).toBe("ask");
    expect(detectCommand("今日はいい天気やった")).toBeNull();
  });
});

describe("withoutEndWord", () => {
  it("止める言葉を中身に入れない", () => {
    expect(withoutEndWord("今日はよく歩いた。終わり")).toBe("今日はよく歩いた");
  });
});

describe("aizuchiAt", () => {
  it("同じ言葉を続けない", () => {
    expect(aizuchiAt(0)).not.toBe(aizuchiAt(1));
    expect(aizuchiAt(100).length).toBeGreaterThan(0);
  });
});
