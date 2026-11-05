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
});
