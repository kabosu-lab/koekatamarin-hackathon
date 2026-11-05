import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { listReplyNotices, markRepliesSeen } from "./reply-notices";
import { seedDatabase } from "./seed";

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function replyIdsOf(postId: string): string[] {
  return (db.prepare("SELECT id FROM replies WHERE post_id = ? ORDER BY rowid").all(postId) as { id: string }[]).map((row) => row.id);
}

describe("届いた返事の知らせ", () => {
  it("最初から入っているダミーの返事は、誰にも知らせない", () => {
    const authors = db.prepare("SELECT id FROM people").all() as { id: string }[];
    for (const { id } of authors) expect(listReplyNotices(db, id)).toEqual([]);
  });

  it("自分の投稿への他の人の返事が、新しいものから届き、投稿した本人にだけ出る", () => {
    const postId = teams.createPost("aoki", "study", "段取り表を作った");
    teams.createReply("saeki", postId, "いいですね");
    teams.createReply("noda", postId, "真似します");
    const notices = listReplyNotices(db, "aoki");
    expect(notices.map((notice) => notice.body).sort()).toEqual(["いいですね", "真似します"]);
    expect(notices[0]).toMatchObject({ postId, channelId: "study" });
    expect(listReplyNotices(db, "saeki")).toEqual([]);
    expect(listReplyNotices(db, "noda")).toEqual([]);
  });

  it("自分で自分に返した分は知らせない", () => {
    const postId = teams.createPost("aoki", "study", "メモ");
    teams.createReply("aoki", postId, "追記");
    expect(listReplyNotices(db, "aoki")).toEqual([]);
  });

  it("閉じると次から出ず、あとから届いた返事は残る", () => {
    const postId = teams.createPost("aoki", "study", "段取り表を作った");
    teams.createReply("saeki", postId, "いいですね");
    markRepliesSeen(db, "aoki", listReplyNotices(db, "aoki").map((notice) => notice.replyId));
    expect(listReplyNotices(db, "aoki")).toEqual([]);
    teams.createReply("noda", postId, "真似します");
    expect(listReplyNotices(db, "aoki").map((notice) => notice.body)).toEqual(["真似します"]);
  });

  it("他の人の投稿への返事は閉じられない", () => {
    const postId = teams.createPost("aoki", "study", "段取り表を作った");
    teams.createReply("saeki", postId, "いいですね");
    markRepliesSeen(db, "noda", replyIdsOf(postId));
    expect(listReplyNotices(db, "aoki")).toHaveLength(1);
  });

  it("隠した相手の返事と、忘れてと言われた言葉は出さない", () => {
    const postId = teams.createPost("aoki", "study", "段取り表を作った");
    teams.createReply("saeki", postId, "いいですね");
    teams.createReply("noda", postId, "真似します");
    db.prepare("INSERT INTO hidden_people (person_id, hidden_person_id, created_at) VALUES ('aoki', 'saeki', 't')").run();
    const [nodaReply] = listReplyNotices(db, "aoki");
    expect(nodaReply.body).toBe("真似します");
    db.prepare("INSERT INTO forgotten_words (person_id, source_id) VALUES ('noda', ?)").run(nodaReply.replyId);
    expect(listReplyNotices(db, "aoki")).toEqual([]);
  });
});
