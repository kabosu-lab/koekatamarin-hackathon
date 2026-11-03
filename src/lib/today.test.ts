import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { seedDatabase } from "./seed";
import {
  cheer,
  handleHints,
  listPopularCards,
  listSeenNotes,
  listTodayCards,
  makeCheerHints,
  recordSeen,
} from "./today";

const NOW = new Date("2026-11-04T01:00:00Z");
const NEXT_DAY = new Date("2026-11-05T01:00:00Z");
const NOTICE = "post-notice-1";
const STAFF = "post-staff-1";
const STUDY = "post-study-1"; // 青木さんの投稿

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

describe("今日のカード", () => {
  it("自分の投稿とお知らせは出さない", () => {
    const cards = listTodayCards(teams, "aoki", NOW);
    expect(cards.map((c) => c.postId)).not.toContain(NOTICE);
    expect(cards.map((c) => c.postId)).not.toContain(STUDY);
    expect(cards.map((c) => c.authorName)).not.toContain("青木 ひより");
  });

  it("生徒のカードに職員室の投稿は出ない", () => {
    expect(listTodayCards(teams, "aoki", NOW).map((c) => c.postId)).not.toContain(STAFF);
    expect(listPopularCards(teams, "aoki").map((c) => c.postId)).not.toContain(STAFF);
    expect(listTodayCards(teams, "saeki", NOW).map((c) => c.postId)).toContain(STAFF);
  });

  it("同じ日は同じ順で、日が変わると変わり、人によっても変わる", () => {
    const today = listTodayCards(teams, "saeki", NOW).map((c) => c.postId);
    expect(listTodayCards(teams, "saeki", NOW).map((c) => c.postId)).toEqual(today);
    expect(listTodayCards(teams, "saeki", NEXT_DAY).map((c) => c.postId)).not.toEqual(today);
    expect(listTodayCards(teams, "ogawara", NOW).map((c) => c.postId)).not.toEqual(today);
  });

  it("人気の投稿は、反応の多い順に並ぶ", () => {
    const scores = listPopularCards(teams, "saeki").map((c) => c.likeCount + c.replyCount);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("誰が見たか", () => {
  it("カードで見た人が、投稿した本人に伝わる", () => {
    expect(recordSeen(db, teams, "saeki", STUDY, NOW)).toBe(true);
    expect(listSeenNotes(db, "aoki", NOW)).toEqual([expect.objectContaining({ seenBy: ["佐伯 みどり"] })]);
  });

  it("本人以外には見せない", () => {
    recordSeen(db, teams, "saeki", STUDY, NOW);
    expect(listSeenNotes(db, "nakamura", NOW)).toEqual([]);
    expect(listSeenNotes(db, "saeki", NOW)).toEqual([]);
  });

  it("同じ人が何度見ても1人として数える", () => {
    recordSeen(db, teams, "saeki", STUDY, NOW);
    recordSeen(db, teams, "saeki", STUDY, NOW);
    expect(listSeenNotes(db, "aoki", NOW)[0].seenBy).toEqual(["佐伯 みどり"]);
  });

  it("読めない投稿や自分の投稿は記録しない", () => {
    expect(recordSeen(db, teams, "aoki", STAFF, NOW)).toBe(false);
    expect(recordSeen(db, teams, "aoki", STUDY, NOW)).toBe(false);
    expect(listSeenNotes(db, "aoki", NOW)).toEqual([]);
  });

  it("古い記録は出さない", () => {
    recordSeen(db, teams, "saeki", STUDY, NOW);
    expect(listSeenNotes(db, "aoki", new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000))).toEqual([]);
  });
});

describe("応援", () => {
  it("いいねになり、2回押しても消えない", () => {
    expect(cheer(teams, "saeki", STUDY)).toBe(true);
    const liked = teams.listPosts("saeki", "study").find((p) => p.id === STUDY);
    expect(liked?.likedByViewer).toBe(true);

    cheer(teams, "saeki", STUDY);
    expect(teams.listPosts("saeki", "study").find((p) => p.id === STUDY)?.likeCount).toBe(liked?.likeCount);
  });

  it("読めない投稿や自分の投稿は応援できない", () => {
    expect(cheer(teams, "aoki", STAFF)).toBe(false);
    expect(cheer(teams, "aoki", STUDY)).toBe(false);
  });
});

describe("応援のきっかけ", () => {
  function recording(answer: unknown) {
    const requests: ClaudeRequest[] = [];
    const claude: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify(answer), refused: false };
      },
    };
    return { claude, requests };
  }

  it("読める投稿だけを材料にする", async () => {
    const { claude, requests } = recording({ hints: [] });
    await makeCheerHints(claude, teams, "aoki", [STAFF, "post-making-1"]);
    const prompt = JSON.stringify(requests[0].messages);
    expect(prompt).not.toContain("席替え");
    expect(prompt).toContain("しおり立て");
  });

  it("頼んでいない投稿のきっかけや、空のきっかけは使わない", async () => {
    const { claude } = recording({
      hints: [
        { postId: "post-making-1", hint: "底を工夫してる！" },
        { postId: STAFF, hint: "職員室の話" },
        { postId: "post-clubs-1", hint: "  " },
      ],
    });
    const hints = await makeCheerHints(claude, teams, "aoki", ["post-making-1", "post-clubs-1"]);
    expect(hints).toEqual([{ postId: "post-making-1", hint: "底を工夫してる！" }]);
  });

  it("指示に、数字や経験を作らない決まりがある", async () => {
    const { claude, requests } = recording({ hints: [] });
    await makeCheerHints(claude, teams, "aoki", ["post-making-1"]);
    expect(requests[0].system).toContain("数字、経験、気持ちを作らない");
  });

  it("失敗しても応援は続けられるよう、空で返す", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };
    expect(await handleHints(failing, teams, "aoki", { postIds: ["post-making-1"] })).toEqual({
      status: 200,
      body: { hints: [] },
    });
    log.mockRestore();
  });

  it("多すぎる依頼は受け付けない", async () => {
    const outcome = await handleHints(createScriptedClaude(), teams, "aoki", { postIds: ["a", "b", "c", "d"] });
    expect(outcome.status).toBe(400);
  });
});
