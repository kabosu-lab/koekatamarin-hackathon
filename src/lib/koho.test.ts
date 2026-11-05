import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { answerKoho, askKoho, isKohoOfficer, listKohoAsked, listKohoCandidates, listKohoRequests } from "./koho";
import { seedDatabase } from "./seed";
import { prOfficerId } from "./seed-data";

const NOW = new Date("2026-11-06T01:00:00Z");
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

const ids = () => listKohoCandidates(db, prOfficerId).map((candidate) => candidate.postId);

describe("広報の候補", () => {
  it("担当にだけ見え、担当以外は何も見えず、頼めない", () => {
    expect(isKohoOfficer("saeki")).toBe(false);
    const postId = teams.createPost("noda", "study", "外へ紹介したい工夫");
    expect(listKohoCandidates(db, "saeki")).toEqual([]);
    expect(listKohoAsked(db, "saeki")).toEqual([]);
    expect(askKoho(db, "saeki", postId, NOW)).toBe(false);
    expect(ids()).toContain(postId);
  });

  it("反応の多い投稿が先に出る", () => {
    const quiet = teams.createPost("noda", "study", "静かな投稿");
    const popular = teams.createPost("noda", "study", "反応の多い投稿");
    teams.toggleLike("saeki", popular);
    teams.createReply("aoki", popular, "いいですね");
    expect(ids().indexOf(popular)).toBeLessThan(ids().indexOf(quiet));
  });

  it("範囲を絞った投稿、確認が必要な投稿、教職員だけの投稿は出ない", () => {
    const hidden = [
      teams.createPost("noda", "study", "自分だけ", { scope: "self" }),
      teams.createPost("noda", "study", "管理職だけ", { scope: "managers" }),
      teams.createPost("noda", "study", "確認が必要", { needsLook: true }),
      teams.createPost("noda", "staffroom", "職員室の話"),
    ];
    for (const id of hidden) expect(ids()).not.toContain(id);
  });

  it("本人が「よい」と答えたものだけが進み、断っても担当には区別が見えない", () => {
    const agreed = teams.createPost("noda", "study", "紹介してよい工夫");
    const declined = teams.createPost("kawamura", "study", "紹介してほしくない工夫");
    expect(askKoho(db, prOfficerId, agreed, NOW)).toBe(true);
    expect(askKoho(db, prOfficerId, declined, NOW)).toBe(true);
    expect(askKoho(db, prOfficerId, agreed, NOW)).toBe(false);
    expect(listKohoRequests(db, "noda").map((request) => request.postId)).toEqual([agreed]);
    expect(answerKoho(db, "saeki", agreed, true, false)).toBe(false);
    expect(answerKoho(db, "noda", agreed, true, false)).toBe(true);
    expect(answerKoho(db, "kawamura", declined, false, false)).toBe(true);
    const asked = listKohoAsked(db, prOfficerId);
    expect(asked.find((item) => item.postId === agreed)?.agreed).toBe(true);
    const other = asked.find((item) => item.postId === declined)!;
    expect(Object.keys(other).sort()).toEqual(["agreed", "authorName", "body", "postId"]);
    expect(other.agreed).toBe(false);
    expect(listKohoRequests(db, "noda")).toEqual([]);
  });

  it("生徒が「よい」と答えるには保護者の同意が要る。断るのには要らない", () => {
    const postId = teams.createPost("aoki", "study", "生徒の工夫");
    askKoho(db, prOfficerId, postId, NOW);
    expect(listKohoRequests(db, "aoki")[0].isStudent).toBe(true);
    expect(answerKoho(db, "aoki", postId, true, false)).toBe(false);
    expect(answerKoho(db, "aoki", postId, true, true)).toBe(true);
    const second = teams.createPost("aoki", "study", "別の工夫");
    askKoho(db, prOfficerId, second, NOW);
    expect(answerKoho(db, "aoki", second, false, false)).toBe(true);
  });
});
