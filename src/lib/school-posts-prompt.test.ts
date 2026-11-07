import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { schoolPostsForPrompt } from "./school-posts-prompt";
import { seedDatabase } from "./seed";

describe("パートナーに渡す校内の投稿", () => {
  it("本人に見える他の人の投稿だけを、名前とチャネル付きで渡す", () => {
    const db = openDatabase(":memory:");
    seedDatabase(db);
    const destination = createDummyTeams(db);
    const forStudent = schoolPostsForPrompt(destination, "aoki");
    expect(forStudent).toContain("<校内の投稿 書いた人=");
    expect(forStudent).toMatch(/立場="生徒（/);
    expect(forStudent).toMatch(/立場="教職員（/);
    expect(forStudent).not.toContain("職員室");
    expect(forStudent).not.toContain('書いた人="青木 ひより"');
    const staffOnly = destination.createPost("saeki", "staffroom", "職員会議の資料の話です");
    expect(staffOnly).toBeTruthy();
    expect(schoolPostsForPrompt(destination, "aoki")).not.toContain("職員会議の資料");
    expect(schoolPostsForPrompt(destination, "ogawara")).toContain("職員会議の資料");
  });

  it("話に近い投稿を先に渡す（3D プリンターの話なら、野田先生の投稿が入る）", () => {
    const db = openDatabase(":memory:");
    seedDatabase(db);
    const destination = createDummyTeams(db);
    for (let i = 0; i < 8; i++) destination.createPost("kawamura", "study", `新しい投稿 ${i}`);
    const recentOnly = schoolPostsForPrompt(destination, "aoki");
    expect(recentOnly).not.toContain("3D プリンター、放課後なら");
    const related = schoolPostsForPrompt(destination, "aoki", "3D プリンターで、文化祭の看板、作ってみたいんだけど");
    // 話に近い投稿は、新しい順の6件に入らなくても先に入る
    const near = related.split("\n").filter((line) => line.startsWith("<校内の投稿")).slice(0, 3).join("\n");
    expect(near).toContain(`書いた人="野田 翔"`);
    expect(related).toContain("3D プリンター、放課後なら");
  });
});
