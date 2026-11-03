import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import { handlePublish } from "./compose-request";
import { dailyQuestion } from "./daily-question";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { timeOfDay } from "./sakura";
import { seedDatabase } from "./seed";
import { listQuietPosts } from "./today";

const scripted = createScriptedClaude();
const DAY = new Date("2026-11-04T01:00:00Z"); // 水曜 10:00
const NIGHT = new Date("2026-11-04T13:00:00Z"); // 水曜 22:00
const SUNDAY = new Date("2026-11-08T01:00:00Z");
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

async function publishCaution(person = "aoki") {
  const words = "あの先生は使えない";
  const outcome = await handlePublish(scripted, teams, person, { text: words, channelId: "study" });
  expect(outcome.status).toBe(200);
  const post = teams.listPosts(person, "study").find((p) => p.body === words);
  return post?.id ?? "";
}

const inStudy = (viewer: string, id: string) => teams.listPosts(viewer, "study").find((p) => p.id === id);

describe("問題のある投稿", () => {
  it("気になる言い方は教職員にだけ確認を促し、本人と生徒には見せない。消さない", async () => {
    const id = await publishCaution();
    expect(inStudy("saeki", id)?.needsLook).toBe(true);
    expect(inStudy("fujimoto", id)?.needsLook).toBe(true);
    expect(inStudy("aoki", id)?.needsLook).toBe(false);
    expect(inStudy("nakamura", id)?.needsLook).toBe(false);
    expect(inStudy("nakamura", id)?.body).toBe("あの先生は使えない");
  });

  it("問題のない投稿や、範囲を絞った投稿には付かない", async () => {
    await handlePublish(scripted, teams, "aoki", { text: "今日は頑張った", channelId: "study" });
    expect(teams.listPosts("saeki", "study").at(-1)?.needsLook).toBe(false);
    const id = teams.createPost("aoki", "study", "相談", { scope: "managers", needsLook: true });
    expect(inStudy("saeki", id)?.needsLook).toBe(false);
  });

  it("確認を促すだけで、人が押すまで共有されない", async () => {
    const before = teams.listPosts("saeki", "staffroom").length;
    await publishCaution();
    expect(teams.listPosts("saeki", "staffroom")).toHaveLength(before);
  });

  it("教職員が押すと、教職員だけのチャネルで共有され、チームで見る言葉が付く", async () => {
    const id = await publishCaution();
    expect(teams.shareConcern("saeki", id)).toBe(true);

    const shared = teams.listPosts("fujimoto", "staffroom").at(-1);
    expect(shared?.body).toContain("あの先生は使えない");
    expect(shared?.body).toContain("担任、生徒指導、学年長、管理職");
    expect(() => teams.listPosts("aoki", "staffroom")).toThrow();
    expect(inStudy("saeki", id)?.sharedToStaff).toBe(true);
    expect(inStudy("aoki", id)?.sharedToStaff).toBe(false);
  });

  it("生徒は共有できず、二重にも共有されない", async () => {
    const id = await publishCaution();
    expect(teams.shareConcern("nakamura", id)).toBe(false);
    expect(teams.shareConcern("saeki", id)).toBe(true);
    expect(teams.shareConcern("noda", id)).toBe(false);
  });

  it("範囲を絞った投稿や、職員室の投稿は共有できない", () => {
    const id = teams.createPost("aoki", "study", "相談", { scope: "managers" });
    expect(teams.shareConcern("saeki", id)).toBe(false);
    expect(teams.shareConcern("saeki", "post-staff-1")).toBe(false);
  });
});

describe("反応のない投稿", () => {
  it("生徒の投稿に反応がなければ、担任にだけ伝える", () => {
    const quiet = listQuietPosts(db, teams, "kawamura", DAY);
    expect(quiet.map((p) => p.postId)).toEqual(["post-clubs-1"]);
    for (const other of ["saeki", "ogawara", "fujimoto", "aoki"]) {
      expect(listQuietPosts(db, teams, other, DAY)).toEqual([]);
    }
  });

  it("反応が付いたら出なくなる", () => {
    teams.createReply("saeki", "post-clubs-1", "すごい");
    expect(listQuietPosts(db, teams, "kawamura", DAY)).toEqual([]);
  });

  it("時間外と、投稿して間もないときは伝えない", () => {
    expect(listQuietPosts(db, teams, "kawamura", NIGHT)).toEqual([]);
    expect(listQuietPosts(db, teams, "kawamura", SUNDAY)).toEqual([]);
    teams.createReply("saeki", "post-clubs-1", "すごい");
    teams.createPost("nakamura", "clubs", "今日の練習");
    expect(listQuietPosts(db, teams, "kawamura", new Date(Date.now() + 60_000))).toEqual([]);
  });

  it("範囲を絞った投稿は伝えない", () => {
    teams.createReply("saeki", "post-clubs-1", "すごい");
    const old = new Date("2026-11-04T01:00:00Z");
    teams.createPost("nakamura", "clubs", "ひとりごと", { scope: "self" });
    expect(listQuietPosts(db, teams, "kawamura", new Date(old.getTime() + 2 * 86400000))).toEqual([]);
  });
});

describe("決まった時間の問いかけ", () => {
  it("朝と夕方で変わり、同じ時間帯なら1つに決まる", () => {
    const evening = new Date("2026-11-04T08:00:00Z"); // 17:00
    expect(dailyQuestion(DAY)).not.toBe(dailyQuestion(evening));
    expect(dailyQuestion(DAY)).toBe(dailyQuestion(new Date("2026-11-04T02:00:00Z")));
  });

  it("時間外には問いかけない", () => {
    expect(dailyQuestion(NIGHT)).toBeNull();
    expect(dailyQuestion(SUNDAY)).toBeNull();
  });
});

describe("空", () => {
  it.each([
    ["2026-11-03T22:00:00Z", "morning"],
    ["2026-11-04T01:00:00Z", "day"],
    ["2026-11-04T08:00:00Z", "evening"],
    ["2026-11-04T13:00:00Z", "night"],
  ])("%s は %s", (time, expected) => {
    expect(timeOfDay(new Date(time))).toBe(expected);
  });
});
