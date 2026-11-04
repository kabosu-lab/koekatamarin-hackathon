import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db";
import { seedDatabase } from "../seed";
import { createDummyTeams } from "./dummy-teams";
import { DestinationError, MAX_BODY_LENGTH, type PostDestination } from "./types";

const TEACHER = "saeki";
const STUDENT = "aoki";
const STAFF_CHANNEL = "staffroom";
const STAFF_POST = "post-staff-1";
const OPEN_CHANNEL = "study";
const OPEN_POST = "post-study-1"; // 青木さんの投稿

let teams: PostDestination;

beforeEach(() => {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function find(viewer: string, channel: string, postId: string) {
  return teams.listPosts(viewer, channel).find((p) => p.id === postId);
}

describe("見える範囲", () => {
  it("生徒には教職員だけのチャネルが一覧に出ない", () => {
    expect(teams.listChannels(STUDENT).map((c) => c.id)).not.toContain(STAFF_CHANNEL);
    expect(teams.listChannels(TEACHER).map((c) => c.id)).toContain(STAFF_CHANNEL);
    expect(teams.listChannels("fujimoto").map((c) => c.id)).toContain(STAFF_CHANNEL);
  });

  it("生徒は教職員だけのチャネルを、読むことも書くこともできない", () => {
    expect(() => teams.listPosts(STUDENT, STAFF_CHANNEL)).toThrow(DestinationError);
    expect(() => teams.createPost(STUDENT, STAFF_CHANNEL, "こんにちは")).toThrow(DestinationError);
    expect(() => teams.createReply(STUDENT, STAFF_POST, "こんにちは")).toThrow(DestinationError);
    expect(() => teams.toggleLike(STUDENT, STAFF_POST)).toThrow(DestinationError);
  });

  it("いない人物としては操作できない", () => {
    expect(() => teams.listChannels("nobody")).toThrow(DestinationError);
    expect(() => teams.createPost("nobody", OPEN_CHANNEL, "こんにちは")).toThrow(DestinationError);
  });
});

describe("投稿と返信", () => {
  it("投稿すると、チャネルの一番下に本人の名前で出る", () => {
    const id = teams.createPost(TEACHER, OPEN_CHANNEL, "  一緒に勉強しましょう  ");

    const posts = teams.listPosts(STUDENT, OPEN_CHANNEL);
    expect(posts.at(-1)).toMatchObject({
      id,
      authorName: "佐伯 みどり",
      body: "一緒に勉強しましょう",
      likeCount: 0,
      replies: [],
    });
  });

  it("返信は投稿の中に、古い順に並ぶ", () => {
    teams.createReply(TEACHER, OPEN_POST, "すごいですね");

    const replies = find(STUDENT, OPEN_CHANNEL, OPEN_POST)?.replies ?? [];
    expect(replies.at(0)?.authorName).toBe("野田 翔");
    expect(replies.at(-1)).toMatchObject({ authorName: "佐伯 みどり", body: "すごいですね" });
  });

  it("空の本文と長すぎる本文は受け付けない", () => {
    expect(() => teams.createPost(TEACHER, OPEN_CHANNEL, "   ")).toThrow("空です");
    expect(() => teams.createReply(TEACHER, OPEN_POST, "")).toThrow("空です");
    expect(() => teams.createPost(TEACHER, OPEN_CHANNEL, "あ".repeat(MAX_BODY_LENGTH + 1))).toThrow("長すぎ");
  });
});

describe("いいね", () => {
  it("押すと増え、もう一度押すと戻る", () => {
    const before = find(TEACHER, OPEN_CHANNEL, OPEN_POST);
    expect(before?.likedByViewer).toBe(false);

    teams.toggleLike(TEACHER, OPEN_POST);
    const liked = find(TEACHER, OPEN_CHANNEL, OPEN_POST);
    expect(liked?.likedByViewer).toBe(true);
    expect(liked?.likeCount).toBe((before?.likeCount ?? 0) + 1);

    teams.toggleLike(TEACHER, OPEN_POST);
    expect(find(TEACHER, OPEN_CHANNEL, OPEN_POST)?.likeCount).toBe(before?.likeCount);
  });

  it("自分の投稿にはいいねできない", () => {
    expect(() => teams.toggleLike(STUDENT, OPEN_POST)).toThrow("自分の投稿");
  });
});

describe("投稿先の差し替え", () => {
  it("画面は dummy-teams を直接呼ばず、getDestination を通す", () => {
    const root = join(process.cwd(), "src/app");
    const direct = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => readFileSync(join(root, file), "utf8").includes("dummy-teams"));
    expect(direct).toEqual([]);
  });
});
