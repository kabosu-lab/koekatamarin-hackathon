import { describe, expect, it } from "vitest";
import { flightPath, lumpFrames, sendTiming, speakerFrames, splitIntoWords, trailFrames } from "./lumps";

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
  const gaps = (times: number[]) => times.slice(1).map((time, index) => time - times[index]);

  it("言葉が固まる間隔は、だんだん短くなる", () => {
    for (const count of [3, 4, 5]) {
      const list = gaps(sendTiming(count).wordTimes);
      list.slice(1).forEach((gap, index) => expect(gap).toBeLessThan(list[index]));
    }
  });

  it("固まる、ためる、飛ぶ、届くの順で、全体は約2.5秒まで", () => {
    for (const count of [0, 1, 2, 3, 4, 5]) {
      const t = sendTiming(count);
      expect(t.wordTimes).toHaveLength(count);
      const order = [...t.absorbTimes, t.gather, t.launch, t.land, t.end];
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(t.end).toBeLessThanOrEqual(2.5);
    }
  });
});

describe("かたまりの動き", () => {
  const t = sendTiming(5);

  it("言葉を吸うたびに大きくなり、ためてから飛ぶ", () => {
    const frames = lumpFrames(t, 400, 800);
    const offsets = frames.map((frame) => frame.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    const grown = frames.filter((frame) => /^scale\(\d\.\d+\)$/.test(frame.transform)).map((frame) => Number(frame.transform.slice(6, -1)));
    expect(grown[grown.length - 2]).toBeGreaterThan(grown[1]);
    expect(frames.some((frame) => frame.transform === "scale(1.3, 0.68)")).toBe(true);
    expect(frames.at(-1)?.opacity).toBe(0);
  });

  it("飛ぶ道は弧を描き、上へ進み、後ろほど速い", () => {
    const path = flightPath(400, 800);
    expect(path.some((point) => point.x < 0)).toBe(true);
    expect(path.at(-1)?.x).toBeGreaterThan(0);
    expect(path.at(-1)?.y).toBeLessThan(-600);
    const step = (index: number) => Math.hypot(path[index + 1].x - path[index].x, path[index + 1].y - path[index].y);
    expect(step(path.length - 2)).toBeGreaterThan(step(0));
  });

  it("尾は transform と opacity だけで、順に遅れて小さくなる", () => {
    const first = trailFrames(t, 400, 800, 0);
    const second = trailFrames(t, 400, 800, 1);
    expect(second.delay).toBeGreaterThan(first.delay);
    expect(Object.keys(first.frames[0]).sort()).toEqual(["offset", "opacity", "transform"]);
  });

  it("分身の動きの時刻は戻らない", () => {
    for (const count of [0, 1, 2, 5]) {
      const offsets = speakerFrames(sendTiming(count)).map((frame) => frame.offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      expect(offsets.at(-1)).toBe(1);
    }
  });
});
