import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoomScene } from "./RoomScene";
import { ROOM_PLACES, roomMoment, roomTables } from "./scene";

const at = (time: string) => new Date(`2026-11-05T${time}:00+09:00`);

function render(tokens: string[], moment: Parameters<typeof RoomScene>[0]["moment"]) {
  return renderToStaticMarkup(createElement(RoomScene, { tokens, moment }));
}

describe("時間と景色", () => {
  it("朝は図書館、夕方は教室、夜はカフェ", () => {
    expect(ROOM_PLACES[roomMoment(at("07:00")).time].place).toBe("library");
    expect(ROOM_PLACES[roomMoment(at("12:00")).time].place).toBe("library");
    expect(ROOM_PLACES[roomMoment(at("17:00")).time].place).toBe("classroom");
    expect(ROOM_PLACES[roomMoment(at("20:00")).time].place).toBe("cafe");
  });

  it("夜遅くの判定は、22時から朝5時まで", () => {
    expect(roomMoment(at("21:59")).late).toBe(false);
    expect(roomMoment(at("22:00")).late).toBe(true);
    expect(roomMoment(at("04:59")).late).toBe(true);
    expect(roomMoment(at("05:00")).late).toBe(false);
  });

  it("?time= で選べて、知らない値は時刻に戻る", () => {
    expect(roomMoment(at("07:00"), "evening")).toEqual({ time: "evening", late: false });
    expect(roomMoment(at("07:00"), "late")).toEqual({ time: "night", late: true });
    for (const unknown of ["noon", "constructor", "__proto__", ["evening"]]) {
      expect(roomMoment(at("07:00"), unknown)).toEqual({ time: "morning", late: false });
    }
  });
});

describe("机", () => {
  it("2人ずつ座り、端数の相棒にも机がある", () => {
    expect(roomTables([])).toEqual([]);
    expect(roomTables(["a"])).toEqual([["a"]]);
    expect(roomTables(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
  });
});

describe("描かれるもの", () => {
  const MOMENTS = [
    { time: "morning", late: false },
    { time: "day", late: false },
    { time: "evening", late: false },
    { time: "night", late: false },
    { time: "night", late: true },
  ] as const;

  it.each(MOMENTS)("$time（夜遅く $late）に、文字も外の絵も音も映像もない", (moment) => {
    const html = render(["t1", "t2", "t3"], moment);
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
    expect(html).not.toMatch(/<(text|title|image|audio|video|button|input|a)\b/);
    expect(html).not.toMatch(/url\((?!#)/);
    const sources = [...html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((match) => match[1]);
    expect(sources.length).toBe(12);
    for (const source of sources) expect(source).toMatch(/^\/api\/avatar\/art\/t\d\/(study|highfive|cheer|stretch)$/);
  });

  it("隣がいれば2人でハイタッチし、一人なら空いた席が残る", () => {
    const html = render(["t1", "t2", "t3"], { time: "morning", late: false });
    expect(html.match(/study-buddy left/g)).toHaveLength(1);
    expect(html.match(/study-buddy right/g)).toHaveLength(1);
    expect(html.match(/study-buddy solo/g)).toHaveLength(1);
    expect(html.match(/room-spark/g)).toHaveLength(1);
    expect(html.match(/room-seat-empty/g)).toHaveLength(1);
  });

  it("夜遅くはハイタッチも応援もしない", () => {
    const html = render(["t1", "t2", "t3", "t4"], { time: "night", late: true });
    expect(html).not.toMatch(/study-buddy (left|right)/);
    expect(html).not.toContain("room-spark");
    expect(html.match(/study-buddy solo/g)).toHaveLength(4);
  });
});
