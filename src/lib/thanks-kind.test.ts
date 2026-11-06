import { describe, expect, it } from "vitest";
import { readThanksKind, sentNotice } from "./thanks-kind";

describe("サンクスカードの種類を言葉から読み取る", () => {
  it.each([
    ["助かりました", "thanks"],
    ["つないでくれて、ありがとうございました", "thanks"],
    ["いつも感謝しています", "thanks"],
    ["朝練、頑張ってたね", "effort"],
    ["がんばったね！", "effort"],
    ["文化祭の準備、お疲れさま", "effort"],
    ["毎日続けてて、すごい", "effort"],
    ["合格おめでとう！", "congrats"],
    ["優勝したんだって", "congrats"],
    ["おめでとうございます、そして頑張ってたね", "congrats"],
    ["ｵﾒﾃﾞﾄｳ", "congrats"],
  ])("「%s」は %s", (message, kind) => {
    expect(readThanksKind(message)).toBe(kind);
  });

  it("手がかりがなければ、ありがとう", () => {
    expect(readThanksKind("この前の資料、見ました")).toBe("thanks");
    expect(readThanksKind("")).toBe("thanks");
  });

  it("お礼と頑張りが両方あるときは、お礼を先に読む", () => {
    expect(readThanksKind("手伝ってくれてありがとう、お疲れさま")).toBe("thanks");
  });

  it("届いたときの知らせは、ありがとうなら今までと同じ文", () => {
    expect(sentNotice("野田 翔", "thanks")).toBe("野田 翔さんに、ありがとうが届きました。");
    expect(sentNotice("中村 結衣", "congrats")).toBe("中村 結衣さんに、「おめでとう」が届きました。");
  });
});
