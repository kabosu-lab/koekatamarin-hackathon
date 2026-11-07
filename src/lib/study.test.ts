import { readdirSync, readFileSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { countLeaves } from "./sakura";
import { seedDatabase } from "./seed";
import {
  ensureDemoCompanions,
  findOwnSession,
  finishStudy,
  getPresence,
  getStudyMates,
  handleStudy,
  isExamPeriod,
  isLateNight,
  startStudy,
  STUDY_MS,
  studyQuestion,
} from "./study";

const NOW = new Date("2026-11-04T06:00:00Z"); // 15:00
const AFTER = new Date(NOW.getTime() + STUDY_MS);
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("タイマー", () => {
  it("25分の勉強が始まり、二重に始まらない", () => {
    const session = startStudy(db, "aoki", NOW);
    expect(session.remainingMs).toBe(25 * 60 * 1000);
    const later = startStudy(db, "aoki", new Date(NOW.getTime() + 60_000));
    expect(later.id).toBe(session.id);
    expect(later.remainingMs).toBe(24 * 60 * 1000);
  });

  it("最後まで続けると葉になり、途中でやめても責めず、葉にならない", () => {
    const leaves = countLeaves(db, NOW);

    const quit = startStudy(db, "aoki", NOW);
    expect(finishStudy(db, "aoki", quit.id, new Date(NOW.getTime() + 60_000))).toEqual({ completed: false });
    expect(countLeaves(db, NOW)).toBe(leaves);

    const done = startStudy(db, "nakamura", NOW);
    expect(finishStudy(db, "nakamura", done.id, AFTER)).toEqual({ completed: true });
    expect(countLeaves(db, AFTER)).toBe(leaves + 1);
  });

  it("他の人の勉強は終わらせられない", () => {
    const session = startStudy(db, "aoki", NOW);
    expect(finishStudy(db, "nakamura", session.id, AFTER)).toBeNull();
    expect(findOwnSession(db, "aoki", NOW)).not.toBeNull();
    expect(handleStudy(db, "nakamura", { action: "finish", sessionId: session.id }, AFTER).status).toBe(404);
  });

  it("おかしな依頼は受け付けない", () => {
    expect(handleStudy(db, "aoki", { action: "x" }).status).toBe(400);
    expect(handleStudy(db, "aoki", null).status).toBe(400);
  });
});

describe("自習室に見えるもの", () => {
  it("人数とパートナーの絵だけで、名前を含まない", () => {
    startStudy(db, "aoki", NOW);
    startStudy(db, "noda", NOW);
    const presence = getPresence(db, NOW);
    expect(presence.count).toBe(2);
    const shown = JSON.stringify(presence);
    expect(shown).not.toContain("青木");
    expect(shown).not.toContain("aoki");
  });

  it("終わった人と時間が過ぎた人は出ない", () => {
    const session = startStudy(db, "aoki", NOW);
    finishStudy(db, "aoki", session.id, NOW);
    startStudy(db, "noda", NOW);
    expect(getPresence(db, NOW).count).toBe(1);
    expect(getPresence(db, new Date(AFTER.getTime() + 1000)).count).toBe(0);
  });

  it("デモのダミーは人数に入るが、葉にはならず、本人の勉強にもならない", () => {
    const leaves = countLeaves(db, NOW);
    ensureDemoCompanions(db, NOW);
    ensureDemoCompanions(db, NOW);
    expect(getPresence(db, NOW).count).toBe(2);
    expect(findOwnSession(db, "aoki", NOW)).toBeNull();
    expect(countLeaves(db, AFTER)).toBe(leaves);
  });

  it("実際に誰かが勉強しているときは、デモのダミーを足さない", () => {
    startStudy(db, "noda", NOW);
    ensureDemoCompanions(db, NOW);
    expect(getPresence(db, NOW).count).toBe(1);
  });

  it("デモのダミーになっている人も、自分で始めれば1人のまま本人の勉強になる", () => {
    ensureDemoCompanions(db, NOW);
    const session = startStudy(db, "aoki", NOW);
    expect(findOwnSession(db, "aoki", NOW)?.id).toBe(session.id);
    expect(getPresence(db, NOW).count).toBe(2);
  });
});

describe("問いかけ", () => {
  it("ふだんとテストの時期で変わる", () => {
    expect(studyQuestion(NOW)).toBe("今日は何をやりましたか？");
    const exam = new Date("2026-11-25T06:00:00Z");
    expect(isExamPeriod(exam)).toBe(true);
    expect(studyQuestion(exam)).toContain("テスト勉強");
  });

  it("夜遅くは続けるよう促さない", () => {
    expect(isLateNight(NOW)).toBe(false);
    expect(isLateNight(new Date("2026-11-04T13:00:00Z"))).toBe(true); // 22:00
    expect(isLateNight(new Date("2026-11-04T19:00:00Z"))).toBe(true); // 4:00
    expect(isLateNight(new Date("2026-11-04T20:00:00Z"))).toBe(false); // 5:00
  });
});

describe("声と映像", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("自習室のコードは、カメラもマイクも音声認識も使わない", () => {
    const code = [...files("src/app/study"), "src/lib/study.ts"].map((file) => readFileSync(file, "utf-8")).join("\n");
    expect(code).not.toMatch(/getUserMedia|getDisplayMedia|RTCPeerConnection|MediaRecorder|SpeechRecognition|startListening/);
    expect(code).not.toContain("<video");
    expect(code).not.toContain("<audio");
  });
});

describe("名札（0-3f）", () => {
  it("勉強中の人の名前・肩書・勉強している分だけを、景色と同じ順で返す", () => {
    ensureDemoCompanions(db, NOW);
    startStudy(db, "noda", new Date(NOW.getTime() - 25 * 60 * 1000 + 1));
    const mates = getStudyMates(db, NOW);
    expect(mates.map((mate) => mate.id)).toEqual(["aoki", "nakamura", "noda"]);
    expect(mates.length).toBe(getPresence(db, NOW).tokens.length);
    expect(mates[0]).toEqual({ id: "aoki", name: "青木 ひより", label: "2年", minutes: 1 });
    expect(mates[2]).toMatchObject({ name: "野田 翔", label: "情報・ものづくり部顧問", minutes: 24 });
    for (const mate of mates) expect(Object.keys(mate).sort()).toEqual(["id", "label", "minutes", "name"]);
  });

  it("名札のコードは、Teams にも外にも何も送らない", () => {
    const code = ["src/app/study/room/RoomPeople.tsx", "src/lib/study.ts"].map((file) => readFileSync(file, "utf-8")).join("\n");
    expect(code).not.toMatch(/fetch\(|teams|graph/i);
  });
});
