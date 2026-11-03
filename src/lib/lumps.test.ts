import { describe, expect, it } from "vitest";
import { sendTiming, splitIntoWords } from "./lumps";

describe("splitIntoWords", () => {
  it("言葉を短いかたまりに分ける", () => {
    const words = splitIntoWords("ロボットが、三回失敗して、やっと動いた！");
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(words.join("")).toContain("ロボット");
  });

  it("「が」のような短い語を1つのかたまりにしない", () => {
    expect(splitIntoWords("ロボットが動いた").every((word) => word !== "が")).toBe(true);
  });

  it("多くても5つで、1つは8文字まで", () => {
    const words = splitIntoWords("とても長い言葉を、いくつもいくつも、つなげて、話して、話して、話し続ける、そんな投稿です");
    expect(words.length).toBeLessThanOrEqual(5);
    expect(words.every((word) => word.length <= 8)).toBe(true);
  });

  it("短い言葉は1つのかたまりになり、記号だけなら空になる", () => {
    expect(splitIntoWords("はい")).toEqual(["はい"]);
    expect(splitIntoWords("！！")).toEqual([]);
  });
});

describe("sendTiming", () => {
  it("言葉が出て、固まり、箱に入って開き、飛んで、届く順になる", () => {
    const t = sendTiming(5);
    expect(t.wordTimes[4]).toBeLessThan(t.gather);
    const order = [t.gather, t.enter, t.open, t.launch, t.land, t.end];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(t.end).toBeLessThan(3.5);
  });

  it("拍は「ぽ、ぽ、ぽぽ、ぽ」で、4つ目だけ詰まる", () => {
    const { wordTimes } = sendTiming(5);
    const gaps = wordTimes.slice(1).map((time, i) => Number((time - wordTimes[i]).toFixed(2)));
    expect(gaps[0]).toBe(gaps[1]);
    expect(gaps[2]).toBeLessThan(gaps[1]);
    expect(gaps[3]).toBe(gaps[1]);
  });
});
