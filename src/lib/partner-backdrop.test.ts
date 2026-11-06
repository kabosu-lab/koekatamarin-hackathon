import { describe, expect, it } from "vitest";
import {
  addSeenRare,
  BACKDROP_PLACES,
  backdropDateKey,
  backdropPlace,
  backdropRare,
  backdropTime,
  parseBackdropParam,
  parseSeenRares,
  pickBackdrop,
  rareCandidates,
  rareLine,
  rarePrefix,
} from "./partner-backdrop";

describe("パートナーの窓の背景（0-2x）", () => {
  it("時刻で朝・昼・夕・夜に切り替わる（放課後は夕方）", () => {
    expect(backdropTime(6)).toBe("morning");
    expect(backdropTime(12)).toBe("noon");
    expect(backdropTime(16)).toBe("evening");
    expect(backdropTime(21)).toBe("night");
    expect(backdropTime(2)).toBe("night");
  });

  it("日本時間で決まる（UTC の朝は日本の夜）", () => {
    const now = new Date("2026-11-07T12:00:00Z"); // 日本の 21 時
    expect(pickBackdrop(now, { rare: null }).time).toBe("night");
    expect(backdropDateKey(new Date("2026-11-07T16:00:00Z"))).toBe("2026-11-08");
  });

  it("場所は日替わりで、4つを順に回る。同じ日は同じ場所", () => {
    const days = ["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"].map(backdropPlace);
    expect(new Set(days).size).toBe(BACKDROP_PLACES.length);
    expect(backdropPlace("2026-11-07")).toBe(backdropPlace("2026-11-07"));
    for (let i = 1; i < days.length; i++) expect(days[i]).not.toBe(days[i - 1]);
  });

  it("レアはまれ。1年のうち出る日は1〜2割ほど", () => {
    let count = 0;
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (let d = 0; d < 365; d++) {
      const key = new Date(start + d * 86_400_000).toISOString().slice(0, 10);
      if (backdropRare(key, "aki", "noon")) count++;
    }
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(70);
  });

  it("季節と時間に合わないレアは出ない", () => {
    expect(rareCandidates("natsu", "noon")).toEqual(["rainbow"]);
    expect(rareCandidates("fuyu", "night")).toEqual(["snow", "shooting-star"]);
    expect(rareCandidates("haru", "morning")).toContain("sakura");
    expect(rareCandidates("haru", "night")).not.toContain("rainbow");
  });

  it("?bg= で時間・場所・レアを固定できる。知らない言葉は無視する", () => {
    expect(parseBackdropParam("night")).toEqual({ time: "night" });
    expect(parseBackdropParam("rare-snow")).toEqual({ rare: "snow" });
    expect(parseBackdropParam("rare-shooting-star")).toEqual({ rare: "shooting-star" });
    expect(parseBackdropParam("evening-library")).toEqual({ time: "evening", place: "library" });
    expect(parseBackdropParam("night,hallway,rare-snow")).toEqual({ time: "night", place: "hallway", rare: "snow" });
    expect(parseBackdropParam("plain")).toEqual({ rare: null });
    expect(parseBackdropParam("unknown")).toEqual({});
    expect(parseBackdropParam(null)).toEqual({});
    const fixed = pickBackdrop(new Date("2026-11-07T03:00:00Z"), parseBackdropParam("night-library,rare-rainbow"));
    expect(fixed).toEqual({ time: "night", place: "library", rare: "rainbow" });
  });

  it("レアの一言は、生徒には気さくに、先生にはです・ます調で", () => {
    expect(rareLine("rainbow", "student")).toBe("今日は虹が出てるよ");
    expect(rareLine("rainbow", "teacher")).toMatch(/ます$/);
    expect(rareLine("snow", undefined)).toMatch(/ね$/);
    expect(rarePrefix("rainbow", "student")).toBe("今日は虹が出てるよ。");
    expect(rarePrefix("shooting-star", "student")).toBe("流れ星が出てるよ。");
    // 一言は問いかけにしない（吹き出しの問いは1つだけ）
    for (const rare of ["sakura", "snow", "rainbow", "shooting-star", "festival"] as const)
      for (const role of ["student", "teacher"]) expect(rareLine(rare, role)).not.toMatch(/[？?]|か$/);
  });

  it("見たレアはコレクションに1つずつ、初めての日で残る", () => {
    let seen = addSeenRare([], "snow", "2026-12-01");
    seen = addSeenRare(seen, "sakura", "2027-04-01");
    seen = addSeenRare(seen, "snow", "2027-01-05");
    expect(seen).toEqual([
      { rare: "sakura", firstSeen: "2027-04-01" },
      { rare: "snow", firstSeen: "2026-12-01" },
    ]);
    expect(parseSeenRares(JSON.stringify(seen))).toEqual(seen);
    expect(parseSeenRares("こわれた")).toEqual([]);
    expect(parseSeenRares(JSON.stringify([{ rare: "ufo", firstSeen: "x" }]))).toEqual([]);
  });
});
