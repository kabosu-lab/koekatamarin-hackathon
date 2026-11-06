import { describe, expect, it } from "vitest";
import {
  allPartnerLines,
  INVITE_LINE,
  inviteLine,
  nextPartnerLine,
  type PartnerLine,
  type PartnerLineInput,
  partnerHour,
  timeOfDay,
} from "./partner-lines";

/** タップを続けたときの一言の並び（本体と同じく、直前の3つを recent に渡す） */
function run(base: Omit<PartnerLineInput, "tapCount" | "recent">, taps: number): PartnerLine[] {
  const lines: PartnerLine[] = [];
  for (let tapCount = 0; tapCount < taps; tapCount++) {
    lines.push(nextPartnerLine({ ...base, tapCount, recent: lines.slice(-3).map((line) => line.text) }));
  }
  return lines;
}

function count(lines: PartnerLine[], kind: PartnerLine["kind"]) {
  return lines.filter((line) => line.kind === kind).length;
}

const STUDENT = { hour: 16, role: "student" as const, firstTime: false, goal: null };
const TEACHER = { ...STUDENT, role: "teacher" as const };

describe("パートナーの一言（0-2a）", () => {
  it("最初の吹き出しはいつも問いかけ", () => {
    for (const firstTime of [true, false]) {
      for (const role of ["student", "teacher"] as const) {
        expect(nextPartnerLine({ ...STUDENT, role, firstTime, tapCount: 0 }).kind).toBe("ask");
      }
    }
  });

  it("慣れた人には、3つの種類を偏らずに回す", () => {
    const lines = run(STUDENT, 30);
    expect(count(lines, "ask")).toBe(10);
    expect(count(lines, "about")).toBe(10);
    expect(count(lines, "guide")).toBe(10);
  });

  it("同じ種類も同じ一言も続かない", () => {
    for (const base of [STUDENT, TEACHER, { ...STUDENT, firstTime: true }, { ...TEACHER, firstTime: true, goal: "授業の準備を早く" }]) {
      const lines = run(base, 40);
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].text).not.toBe(lines[i - 1].text);
        expect(lines[i].kind).not.toBe(lines[i - 1].kind);
      }
    }
  });

  it("初めての人には操作の案内を多めにする", () => {
    const first = run({ ...STUDENT, firstTime: true }, 40);
    const regular = run(STUDENT, 40);
    expect(count(first, "guide")).toBeGreaterThan(count(first, "ask"));
    expect(count(first, "guide")).toBeGreaterThan(count(first, "about"));
    expect(count(first, "guide")).toBeGreaterThan(count(regular, "guide"));
    // 初めての人でも、問いかけと説明は出る
    expect(count(first, "ask")).toBeGreaterThan(0);
    expect(count(first, "about")).toBeGreaterThan(0);
  });

  it("初めての人の案内も、一周するまで同じものをくり返さない", () => {
    const guides = run({ ...STUDENT, firstTime: true }, 16).filter((line) => line.kind === "guide");
    expect(new Set(guides.slice(0, 4).map((line) => line.text)).size).toBe(4);
  });

  it("生徒と先生で言い方が違う", () => {
    for (let tapCount = 0; tapCount < 12; tapCount++) {
      const student = nextPartnerLine({ ...STUDENT, tapCount });
      const teacher = nextPartnerLine({ ...TEACHER, tapCount });
      expect(student.kind).toBe(teacher.kind);
      expect(student.text).not.toBe(teacher.text);
    }
    const studentAll = run(STUDENT, 24).map((line) => line.text).join("\n");
    const teacherAll = run(TEACHER, 24).map((line) => line.text).join("\n");
    expect(studentAll).toContain("日記");
    expect(teacherAll).toContain("日報");
    expect(inviteLine("student")).toBe(INVITE_LINE.student);
    expect(inviteLine("teacher")).not.toBe(inviteLine("student"));
  });

  it("管理の人は先生と同じ言い方", () => {
    expect(nextPartnerLine({ ...STUDENT, role: "admin", tapCount: 1 })).toEqual(nextPartnerLine({ ...TEACHER, tapCount: 1 }));
  });

  it("先生用の一言はすべてです・ます調で終わる（0-2c）", () => {
    const polite = /(です|ます|ません|ました|でした|ましょう|ください)(ね|よ|か)?[。？！]?$/;
    for (const line of allPartnerLines("teacher")) {
      for (const sentence of line.split(/(?<=[。？！])\s*/).filter(Boolean)) {
        expect(sentence, line).toMatch(polite);
      }
    }
    expect(INVITE_LINE.teacher).toMatch(polite);
  });

  it("時刻で問いかけが変わる", () => {
    const at = (hour: number) => nextPartnerLine({ ...STUDENT, hour, tapCount: 0 }).text;
    const texts = new Set([at(8), at(12), at(16), at(21)]);
    expect(texts.size).toBe(4);
    expect(nextPartnerLine({ ...TEACHER, hour: 8, tapCount: 0 }).text).not.toBe(nextPartnerLine({ ...TEACHER, hour: 20, tapCount: 0 }).text);
  });

  it("時刻の区切り", () => {
    expect([4, 5, 9, 10, 14, 15, 17, 18, 23, 0].map(timeOfDay)).toEqual([
      "night",
      "morning",
      "morning",
      "noon",
      "noon",
      "afterschool",
      "afterschool",
      "night",
      "night",
      "night",
    ]);
    // 日本時間で数える（UTC 0時 = 日本の9時）
    expect(partnerHour(new Date("2026-11-07T00:00:00Z"))).toBe(9);
  });

  it("頑張りたいことに合わせた一言が回ってくる", () => {
    const lines = run({ ...STUDENT, goal: "毎日英単語を10個" }, 12).map((line) => line.text);
    expect(lines).toContain("「毎日英単語を10個」、最近はどう？");
    // 長すぎる頑張りたいことは入れず、全部見える長さを守る
    const long = run({ ...STUDENT, goal: "教員の仕事を楽にするアプリ開発を最後までやりきる" }, 12).map((line) => line.text);
    expect(long).toContain("頑張りたいこと、最近はどう？");
  });

  it("どの一言も吹き出しで全部見える長さ（2行ほど）", () => {
    for (const line of [...allPartnerLines("student"), ...allPartnerLines("teacher")]) {
      expect(line.length, line).toBeLessThanOrEqual(36);
    }
  });
});
