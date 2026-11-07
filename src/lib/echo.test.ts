import { describe, expect, it } from "vitest";
import { echoCoverage, isEchoOf, normalizeForEcho, splitSentences } from "./echo";

// 0-3l の記録にあった、パートナーの読み上げを本人の言葉として拾った例（文はダミーに言い換え）
const SPOKEN = "その考え方は、2月に提唱しました。NTTのページなどでは、図で説明されています。";
const SPOKEN2 = "下書きは自動でできていて、仕上げには人の確認が欠かせないようです。";

describe("normalizeForEcho", () => {
  it("句読点・空白を除き、全角半角と大文字小文字をそろえる", () => {
    expect(normalizeForEcho("ＮＴＴ の、ページ。")).toBe("nttのページ");
  });
});

describe("isEchoOf", () => {
  it("読み上げの一部をそのまま拾ったら、読み上げとみなす", () => {
    expect(isEchoOf("2月に提唱しました", [SPOKEN])).toBe(true);
    expect(isEchoOf("いて、仕上げには人の確認が欠かせないようです", [SPOKEN2])).toBe(true);
  });

  it("聞き違いや句読点の違いがあっても、大きく重なれば読み上げとみなす", () => {
    expect(isEchoOf("2月に提唱しましたなnttのページなどでは", [SPOKEN])).toBe(true);
    expect(isEchoOf("仕上げには人の確認が欠かせない用です", [SPOKEN2])).toBe(true);
  });

  it("本人の別の話は捨てない", () => {
    expect(isEchoOf("今日の授業で班の話し合いがうまくいった", [SPOKEN, SPOKEN2])).toBe(false);
    expect(isEchoOf("それってどういう意味なん", [SPOKEN])).toBe(false);
  });

  it("「うん」「はい」のような短い返事は捨てない", () => {
    expect(isEchoOf("うん", ["うんうん、それで？"])).toBe(false);
    expect(isEchoOf("はい", ["はい、届けました。"])).toBe(false);
  });

  it("読み上げがなければ捨てない", () => {
    expect(isEchoOf("2月に提唱しました", [])).toBe(false);
  });
});

describe("echoCoverage", () => {
  it("読み上げに含まれていれば 1、まったく違えば 0", () => {
    expect(echoCoverage("人の確認", SPOKEN2)).toBe(1);
    expect(echoCoverage("体育館", SPOKEN2)).toBe(0);
  });
});

describe("splitSentences", () => {
  it("句点などで文に分ける", () => {
    expect(splitSentences("いいね。どう思う？ほんまに!")).toEqual(["いいね。", "どう思う？", "ほんまに!"]);
  });

  it("句点がなければ、そのまま1文", () => {
    expect(splitSentences("なるほど")).toEqual(["なるほど"]);
    expect(splitSentences("  ")).toEqual([]);
  });
});
