import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { handleDraft, handlePublish, handleUndo } from "./compose-request";
import { buildDirectory } from "./connect";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { DestinationError, type PostDestination } from "./destination/types";
import { handlePass, listInbox, listPassCandidates } from "./inbox";
import { handleProfile } from "./profile";
import { countLeaves } from "./sakura";
import { seedDatabase } from "./seed";
import { cheer, listPopularCards, listTodayCards, recordSeen } from "./today";

const scripted = createScriptedClaude();
const NOW = new Date("2026-11-04T01:00:00Z");
const WORDS = "範囲を絞った言葉";

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function seen(viewer: string, channel = "study"): string[] {
  return teams.listPosts(viewer, channel).map((p) => p.body);
}

describe("見える範囲", () => {
  it("初めは今までどおり、チャネルのみんなに見える", () => {
    teams.createPost("aoki", "study", WORDS);
    for (const viewer of ["aoki", "saeki", "nakamura", "fujimoto"]) expect(seen(viewer)).toContain(WORDS);
  });

  it("自分だけ：本人にしか見えない", () => {
    teams.createPost("aoki", "study", WORDS, { scope: "self" });
    expect(seen("aoki")).toContain(WORDS);
    for (const viewer of ["saeki", "nakamura", "fujimoto", "shiraishi"]) expect(seen(viewer)).not.toContain(WORDS);
  });

  it("特定の人：本人と選んだ人にしか見えない", () => {
    teams.createPost("aoki", "study", WORDS, { scope: "person", scopePersonId: "noda" });
    expect(seen("aoki")).toContain(WORDS);
    expect(seen("noda")).toContain(WORDS);
    for (const viewer of ["saeki", "nakamura", "fujimoto"]) expect(seen(viewer)).not.toContain(WORDS);
  });

  it("管理職や担任：生徒は担任に、先生は管理職に見える", () => {
    teams.createPost("aoki", "study", WORDS, { scope: "managers" });
    expect(seen("saeki")).toContain(WORDS); // 青木さんの担任
    for (const viewer of ["fujimoto", "noda", "nakamura"]) expect(seen(viewer)).not.toContain(WORDS);

    teams.createPost("noda", "staffroom", "先生から", { scope: "managers" });
    expect(seen("fujimoto", "staffroom")).toContain("先生から");
    expect(seen("saeki", "staffroom")).not.toContain("先生から");
  });

  it("範囲の外の人は、返信もいいねもできない", () => {
    const id = teams.createPost("aoki", "study", WORDS, { scope: "self" });
    expect(() => teams.createReply("saeki", id, "x")).toThrow(DestinationError);
    expect(() => teams.toggleLike("saeki", id)).toThrow(DestinationError);
  });

  it("相手を選ばない特定の人向けは送れず、自分や読めない人も選べない", () => {
    expect(() => teams.createPost("aoki", "study", WORDS, { scope: "person" })).toThrow("相手");
    expect(() => teams.createPost("aoki", "study", WORDS, { scope: "person", scopePersonId: "aoki" })).toThrow("相手");
    expect(() => teams.createPost("saeki", "staffroom", WORDS, { scope: "person", scopePersonId: "aoki" })).toThrow(DestinationError);
  });

  it("お願いは、聞く相手に見える範囲にしか置けない", () => {
    expect(() => teams.createPost("aoki", "study", WORDS, { askedPersonId: "noda", scope: "self" })).toThrow("聞く相手");
    expect(() => teams.createPost("aoki", "study", WORDS, { askedPersonId: "noda", scope: "managers" })).toThrow("聞く相手");
    const id = teams.createPost("aoki", "study", WORDS, { askedPersonId: "noda", scope: "person", scopePersonId: "noda" });
    expect(listInbox(db, "noda").map((i) => i.postId)).toContain(id);
  });

  it("おかしな範囲は受け付けない", async () => {
    const input = { text: WORDS, channelId: "study", scope: "全世界" };
    expect((await handlePublish(scripted, teams, "aoki", input)).status).toBe(400);
  });
});

describe("範囲を絞った投稿は、他の機能から漏れない", () => {
  beforeEach(() => {
    teams.createPost("aoki", "study", WORDS, { scope: "managers" }); // 担任の佐伯先生には見える
  });

  it("今日のカードと人気の投稿に出ない（読める人にも）", () => {
    expect(JSON.stringify(listTodayCards(teams, "saeki", NOW))).not.toContain(WORDS);
    expect(JSON.stringify(listPopularCards(teams, "saeki"))).not.toContain(WORDS);
  });

  it("人の紹介の材料に入らない（読める人が頼んでも）", () => {
    expect(JSON.stringify(buildDirectory(db, teams, "saeki"))).not.toContain(WORDS);
  });

  it("プロフィールの材料に入らない", async () => {
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ ready: false, text: "" }), refused: false };
      },
    };
    await handleProfile(recording, db, teams, "aoki", { action: "draft" });
    expect(JSON.stringify(requests)).not.toContain(WORDS);
  });

  it("読めない人は、カードの応援や見た記録にも使えない", () => {
    const id = teams.listPosts("aoki", "study").find((p) => p.body === WORDS)?.id ?? "";
    expect(cheer(teams, "nakamura", id)).toBe(false);
    expect(recordSeen(db, teams, "nakamura", id, NOW)).toBe(false);
  });

  it("範囲を絞ったお願いは、パスで他の人に回せない", () => {
    const id = teams.createPost("aoki", "study", "お願い", { askedPersonId: "noda", scope: "person", scopePersonId: "noda" });
    expect(listPassCandidates(db, teams, id, "noda")).toEqual([]);
    expect(handlePass(db, teams, "noda", { postId: id, toPersonId: "ogawara" }, NOW).status).toBe(404);
    expect(seen("ogawara")).not.toContain("お願い");
  });

  it("自分だけの投稿は桜の葉にならない", () => {
    const before = countLeaves(db, new Date());
    teams.createPost("aoki", "study", "ひとりごと", { scope: "self" });
    expect(countLeaves(db, new Date())).toBe(before);
    teams.createPost("aoki", "study", "みんなへ");
    expect(countLeaves(db, new Date())).toBe(before + 1);
  });
});

describe("送った直後の取り消し", () => {
  it("本人が取り消すと消える", () => {
    const id = teams.createPost("aoki", "study", WORDS);
    expect(handleUndo(teams, "aoki", { postId: id }, new Date()).status).toBe(200);
    expect(seen("aoki")).not.toContain(WORDS);
  });

  it("本人以外は取り消せない", () => {
    const id = teams.createPost("aoki", "study", WORDS);
    expect(handleUndo(teams, "saeki", { postId: id }, new Date()).status).toBe(409);
    expect(seen("aoki")).toContain(WORDS);
  });

  it("時間が過ぎたら、誰かが返したら、取り消せない", () => {
    const id = teams.createPost("aoki", "study", WORDS);
    expect(handleUndo(teams, "aoki", { postId: id }, new Date(Date.now() + 6 * 60 * 1000)).status).toBe(409);

    teams.createReply("noda", id, "すごい");
    expect(handleUndo(teams, "aoki", { postId: id }, new Date()).status).toBe(409);
    expect(seen("aoki")).toContain(WORDS);
  });
});

describe("下書き", () => {
  it("見せる相手の候補に、本人は入らない", async () => {
    const outcome = await handleDraft(scripted, teams, "aoki", { history: [{ role: "user", content: "頑張った" }] });
    expect(outcome.status === 200 && outcome.body.people.map((p) => p.id)).not.toContain("aoki");
  });
});
