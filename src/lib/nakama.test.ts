import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { buildPublicEntries } from "./connect";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { handleNakama, listHiddenIds, listHiddenPeople, setHidden, suggestNakama } from "./nakama";
import { seedDatabase } from "./seed";
import { listPopularCards, listQuietPosts, listTodayCards } from "./today";

const NOW = new Date("2026-11-04T01:00:00Z");
const scripted = createScriptedClaude();
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function recording(answer: unknown, seen: ClaudeRequest[] = [], refused = false): ClaudeClient {
  return {
    mode: "real",
    complete: async (request) => {
      seen.push(request);
      return { text: JSON.stringify(answer), refused };
    },
  };
}

function entries(viewer: string) {
  const all = buildPublicEntries(db, teams, viewer);
  return { self: all.find((e) => e.id === viewer)!, others: all.filter((e) => e.id !== viewer) };
}

describe("仲間を探す", () => {
  it("公開でない投稿と、隠した人は材料に入らない", async () => {
    teams.createPost("nakamura", "study", "自分だけの秘密の言葉", { scope: "self" });
    teams.createPost("noda", "study", "相手を絞った秘密の言葉", { scope: "person", scopePersonId: "aoki" });
    setHidden(db, "aoki", "saeki", true, NOW);

    const seen: ClaudeRequest[] = [];
    const { status } = await handleNakama(recording({ suggestions: [] }, seen), db, teams, "aoki");

    expect(status).toBe(200);
    const prompt = seen[0].messages[0].content;
    expect(prompt).not.toContain("秘密の言葉");
    expect(prompt).not.toContain("saeki：");
  });

  it("候補にない人、理由のない人、重なりを捨て、最大3人にする", async () => {
    const { self, others } = entries("aoki");
    const ids = others.map((o) => o.id);
    const answer = {
      suggestions: [
        { personId: "unknown", reason: "x" },
        { personId: ids[0], reason: "" },
        { personId: ids[1], reason: "a" },
        { personId: ids[1], reason: "b" },
        { personId: ids[2], reason: "c" },
        { personId: ids[3], reason: "d" },
        { personId: ids[4], reason: "e" },
      ],
    };
    const found = await suggestNakama(recording(answer), self, others);
    expect(found.map((f) => f.personId)).toEqual([ids[1], ids[2], ids[3]]);
    expect(found[0].reason).toBe("a");
  });

  it("断られたら候補を出さず、形が違えば失敗として返す", async () => {
    const { self, others } = entries("aoki");
    expect(await suggestNakama(recording({ suggestions: [] }, [], true), self, others)).toEqual([]);
    expect(await suggestNakama(recording({ other: 1 }), self, others)).toEqual([]);
  });

  it("言葉がない人には Claude を呼ばず、判定ではなく出し方を伝える", async () => {
    db.prepare("UPDATE people SET public_profile = '' WHERE id = 'fujimoto'").run();
    db.prepare("DELETE FROM replies WHERE author_id = 'fujimoto'").run();
    db.prepare("DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE author_id = 'fujimoto')").run();
    db.prepare("DELETE FROM posts WHERE author_id = 'fujimoto'").run();
    const seen: ClaudeRequest[] = [];
    const { body } = await handleNakama(recording({ suggestions: [] }, seen), db, teams, "fujimoto");
    expect(body).toMatchObject({ suggestions: [], needsWords: true });
    expect(seen).toEqual([]);
  });

  it("台本でも流れを確かめられる", async () => {
    const { body } = await handleNakama(scripted, db, teams, "aoki");
    expect((body as { suggestions: unknown[] }).suggestions.length).toBeGreaterThan(0);
  });

  it("指示で、孤立や友だちの少なさに触れないことを伝えている", async () => {
    const seen: ClaudeRequest[] = [];
    const { self, others } = entries("aoki");
    await suggestNakama(recording({ suggestions: [] }, seen), self, others);
    expect(seen[0].system).toContain("友だちの数");
    expect(seen[0].system).toContain("公開の言葉");
  });

  it("孤立の印を残す列や表を作らない", () => {
    const schema = JSON.stringify(db.prepare("SELECT sql FROM sqlite_master").all());
    expect(schema).not.toMatch(/lonely|isolated|alone|孤立/i);
  });
});

describe("しばらく出さない", () => {
  it("本人のカードと人気の投稿から除かれ、戻すと出る", () => {
    const author = listPopularCards(teams, "ogawara")[0].authorId;
    setHidden(db, "ogawara", author, true, NOW);
    const hidden = listHiddenIds(db, "ogawara");

    expect(listPopularCards(teams, "ogawara", hidden).some((c) => c.authorId === author)).toBe(false);
    expect(listTodayCards(teams, "ogawara", NOW, hidden).some((c) => c.authorId === author)).toBe(false);

    setHidden(db, "ogawara", author, false, NOW);
    expect(listHiddenIds(db, "ogawara").size).toBe(0);
  });

  it("相手の一覧にも、ほかの人の一覧にも出ない", () => {
    setHidden(db, "aoki", "nakamura", true, NOW);
    expect(listHiddenPeople(db, "aoki").map((p) => p.id)).toEqual(["nakamura"]);
    expect(listHiddenPeople(db, "nakamura")).toEqual([]);
    expect(listHiddenPeople(db, "saeki")).toEqual([]);
    expect(listPopularCards(teams, "saeki").length).toBeGreaterThan(0);
  });

  it("自分や存在しない人は隠せない", () => {
    expect(setHidden(db, "aoki", "aoki", true, NOW)).toBe(false);
    expect(setHidden(db, "aoki", "unknown", true, NOW)).toBe(false);
  });

  it("担任への気づきは、担任が隠していても止まらない", () => {
    const old = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
    const { homeroom_teacher_id: teacher } = db
      .prepare("SELECT homeroom_teacher_id FROM people WHERE id = 'aoki'")
      .get() as { homeroom_teacher_id: string };
    teams.createPost("aoki", "study", "反応を待っている言葉", {});
    db.prepare("UPDATE posts SET created_at = ? WHERE body = '反応を待っている言葉'").run(old.toISOString());
    db.prepare("DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE author_id = 'aoki' AND body != '反応を待っている言葉')").run();
    const before = listQuietPosts(db, teams, teacher, NOW).map((c) => c.postId);
    setHidden(db, teacher, "aoki", true, NOW);
    expect(listQuietPosts(db, teams, teacher, NOW).map((c) => c.postId)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });
});
