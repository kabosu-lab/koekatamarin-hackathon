import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { listHiddenIds, listHiddenPeople, setHidden } from "./hidden-people";
import { seedDatabase } from "./seed";
import { listPopularCards, listQuietPosts, listTodayCards } from "./today";

const NOW = new Date("2026-11-04T01:00:00Z");
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
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

  it("孤立の印を残す列や表を作らない", () => {
    const schema = JSON.stringify(db.prepare("SELECT sql FROM sqlite_master").all());
    expect(schema).not.toMatch(/lonely|isolated|alone|孤立/i);
  });
});
