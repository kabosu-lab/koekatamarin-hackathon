import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase, SCHEMA_VERSION } from "./db";
import { createFeedbackLimiter, escapeFeedbackText, feedbackToMarkdown, parseFeedback, saveFeedback } from "./feedback";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T01:00:00Z");

describe("改善点の受け取り", () => {
  it("種類だけでも送れて、知らない種類や長すぎる本文は受け取らない", () => {
    expect(parseFeedback({ kind: "よかった" })).toEqual({ kind: "よかった", body: "", path: "不明", screenWidth: null });
    expect(parseFeedback({ kind: "違う" })).toBeNull();
    expect(parseFeedback({ body: "本文だけ" })).toBeNull();
    expect(parseFeedback(null)).toBeNull();
    expect(parseFeedback({ kind: "動かない", body: 1 })).toBeNull();
    expect(parseFeedback({ kind: "動かない", body: "あ".repeat(1000) })?.body).toHaveLength(1000);
    expect(parseFeedback({ kind: "動かない", body: "あ".repeat(1001) })).toBeNull();
  });

  it("道は問い合わせを落とし、おかしな幅は不明にする", () => {
    const parsed = parseFeedback({ kind: "動かない", path: "/teams?channel=a#post-1", screenWidth: 390 });
    expect(parsed?.path).toBe("/teams");
    expect(parsed?.screenWidth).toBe(390);
    expect(parseFeedback({ kind: "動かない", path: "https://x.example/", screenWidth: -1 })).toMatchObject({ path: "不明", screenWidth: null });
  });

  it("保存する列に、人物、cookie、IP がない", () => {
    const db = openDatabase(":memory:");
    const columns = (db.prepare("PRAGMA table_info(trial_feedback)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(["id", "kind", "body", "path", "screen_width", "created_at"]);
  });
});

describe("連打を抑える", () => {
  it("同じ端末は1分に10件まで。時間がたてばまた送れる", () => {
    const allow = createFeedbackLimiter();
    for (let i = 0; i < 10; i += 1) expect(allow("a", 0)).toBe(true);
    expect(allow("a", 1000)).toBe(false);
    expect(allow("b", 1000)).toBe(true);
    expect(allow("a", 60_000)).toBe(true);
  });

  it("印のない人は広めにまとめて数える", () => {
    const allow = createFeedbackLimiter();
    for (let i = 0; i < 60; i += 1) expect(allow(null, 0)).toBe(true);
    expect(allow(null, 0)).toBe(false);
  });
});

describe("一覧", () => {
  it("HTML や Markdown の記号を無害にする", () => {
    const escaped = escapeFeedbackText('<img src=x onerror="a()">\n# 見出し\n[x](javascript:a)');
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;img");
    expect(escaped).toContain("> \\# 見出し");
    expect(escaped).toContain("\\[x\\]\\(javascript:a\\)");
  });

  it("種類ごとの数と本文を出す", () => {
    const db = openDatabase(":memory:");
    saveFeedback(db, { kind: "動かない", body: "ボタンが<b>", path: "/teams", screenWidth: 390 }, NOW);
    saveFeedback(db, { kind: "よかった", body: "", path: "/", screenWidth: null }, NOW);
    const markdown = feedbackToMarkdown(db);
    expect(markdown).toContain("全 2 件");
    expect(markdown).toContain("- 動かない：1 件");
    expect(markdown).toContain("/teams");
    expect(markdown).toContain("幅 390");
    expect(markdown).toContain("ボタンが&lt;b&gt;");
  });
});

describe("既存のデータベース", () => {
  it("試用中のデータを消さず、表だけを足せる", () => {
    const dir = mkdtempSync(join(tmpdir(), "koekata-feedback-"));
    const path = join(dir, "t.db");
    try {
      const before = openDatabase(path);
      seedDatabase(before);
      // 試用を始めた時点の版へ戻す（trial_feedback より後の変更も外す）
      before.exec(`ALTER TABLE report_items DROP COLUMN edited; ALTER TABLE daily_reports DROP COLUMN evening_at; ALTER TABLE daily_reports DROP COLUMN talk_seen; ALTER TABLE daily_reports DROP COLUMN included_until; DROP TABLE room_music; DROP TABLE koho_requests; DROP TABLE post_rsvps; ALTER TABLE posts DROP COLUMN is_announcement; DROP TABLE teams_links; DROP TABLE portfolio_reflections; DROP TABLE portfolio_items; DROP TABLE seen_replies; DROP TABLE trophy_log; ALTER TABLE knowledge_items DROP COLUMN topic; DROP TABLE trial_feedback; PRAGMA user_version = ${SCHEMA_VERSION - 9};`);
      const posts = (before.prepare("SELECT count(*) AS c FROM posts").get() as { c: number }).c;
      expect(posts).toBeGreaterThan(0);
      before.close();

      const after = openDatabase(path);
      seedDatabase(after);
      expect((after.prepare("SELECT count(*) AS c FROM posts").get() as { c: number }).c).toBe(posts);
      saveFeedback(after, { kind: "こうしたい", body: "本文", path: "/", screenWidth: 400 }, NOW);
      after.close();

      const readOnly = new DatabaseSync(path, { readOnly: true });
      expect(feedbackToMarkdown(readOnly)).toContain("全 1 件");
      readOnly.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
