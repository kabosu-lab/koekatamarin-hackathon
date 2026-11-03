import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";
import { channels, people, posts, schoolName } from "./seed-data";

function seeded() {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  return db;
}

function count(db: ReturnType<typeof seeded>, table: string): number {
  const row = db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

describe("ダミーのデータ", () => {
  it("学校が架空だと名前から分かる", () => {
    expect(schoolName).toContain("架空");
  });

  it("先生5人・管理職1人・生徒3人がいる", () => {
    const byRole = (role: string) => people.filter((p) => p.role === role).length;
    expect(byRole("teacher")).toBe(5);
    expect(byRole("admin")).toBe(1);
    expect(byRole("student")).toBe(3);
  });

  it("デモに必要な人がいる", () => {
    const profiles = people.map((p) => p.publicProfile);
    expect(profiles.some((t) => t.includes("苦手"))).toBe(true); // ICT が苦手な先生
    expect(profiles.some((t) => t.includes("先輩"))).toBe(true);
    expect(profiles.some((t) => t.includes("資格の勉強会"))).toBe(true);
    expect(profiles.some((t) => t.includes("3D プリンター"))).toBe(true);
  });

  it("生徒は教職員だけのチャネルの投稿・返信・いいねに関わらない", () => {
    const students = new Set(people.filter((p) => p.role === "student").map((p) => p.id));
    const staffChannels = new Set(channels.filter((c) => c.audience === "staff").map((c) => c.id));
    for (const post of posts.filter((p) => staffChannels.has(p.channelId))) {
      const involved = [post.authorId, ...post.replies.map((r) => r.authorId), ...post.likedBy];
      expect(involved.filter((id) => students.has(id))).toEqual([]);
    }
  });

  it("返信は元の投稿より後の時刻で、自分の投稿にいいねしていない", () => {
    for (const post of posts) {
      expect(post.likedBy).not.toContain(post.authorId);
      for (const reply of post.replies) {
        expect(Date.parse(reply.createdAt)).toBeGreaterThan(Date.parse(post.createdAt));
      }
    }
  });
});

describe("seedDatabase", () => {
  it("すべて入り、参照の切れがない", () => {
    const db = seeded();
    expect(count(db, "people")).toBe(people.length);
    expect(count(db, "channels")).toBe(channels.length);
    expect(count(db, "posts")).toBe(posts.length);
    expect(count(db, "replies")).toBe(posts.flatMap((p) => p.replies).length);
    expect(count(db, "post_likes")).toBe(posts.flatMap((p) => p.likedBy).length);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("2回目は何もせず、デモの続きを消さない", () => {
    const db = seeded();
    db.prepare("DELETE FROM posts WHERE id = ?").run(posts[0].id);
    seedDatabase(db);
    expect(count(db, "posts")).toBe(posts.length - 1);
    db.close();
  });
});
