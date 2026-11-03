import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { collectMaterial, handleLookback, periodStart } from "./lookback";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T09:00:00Z");
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("期間", () => {
  it("学期と年度の始まりを、日本の日付で決める", () => {
    expect(periodStart("term", NOW)).toBe(new Date("2026-09-01T00:00:00+09:00").toISOString());
    expect(periodStart("year", NOW)).toBe(new Date("2026-04-01T00:00:00+09:00").toISOString());
    expect(periodStart("term", new Date("2027-02-01T01:00:00Z"))).toBe(new Date("2027-01-01T00:00:00+09:00").toISOString());
    expect(periodStart("year", new Date("2027-02-01T01:00:00Z"))).toBe(new Date("2026-04-01T00:00:00+09:00").toISOString());
    expect(periodStart("term", new Date("2026-05-01T01:00:00Z"))).toBe(new Date("2026-04-01T00:00:00+09:00").toISOString());
  });
});

describe("材料", () => {
  it("本人のものだけで、他の人の日報は入らない", () => {
    const material = collectMaterial(db, "saeki", periodStart("year", NOW)).join("\n");
    expect(material).toContain("いいところを一つだけ");
    expect(material).not.toContain("過去問の点数");
  });

  it("期間より前のものは入らない", () => {
    const material = collectMaterial(db, "saeki", new Date("2026-10-01T00:00:00+09:00").toISOString()).join("\n");
    expect(material).toContain("いいところを一つだけ");
    expect(material).not.toContain("文化祭");
  });

  it("種類に関わらず時系列に並び、多いときは新しいものが残る", () => {
    const insert = db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, 'post-making-1', 'saeki', ?, ?)");
    for (let i = 0; i < 90; i += 1) {
      insert.run(`old-${i}`, `古い返信 ${i}`, new Date(`2026-08-01T00:00:00Z`).toISOString());
    }
    const material = collectMaterial(db, "saeki", periodStart("year", NOW));
    expect(material).toHaveLength(80);
    expect(material.join("\n")).toContain("いいところを一つだけ");
    const order = (word: string) => material.findIndex((line) => line.includes(word));
    expect(order("文化祭")).toBeLessThan(order("いいところを一つだけ"));
  });

  it("もらったありがとうが入る", () => {
    db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES ('t', 'noda', 'saeki', '助かりました', ?)").run(NOW.toISOString());
    expect(collectMaterial(db, "saeki", periodStart("term", NOW)).join("\n")).toContain("野田 翔さんから：助かりました");
  });
});

describe("ふりかえり", () => {
  it("作っても何も保存されず、他の人に届かない", async () => {
    const tables = ["posts", "replies", "report_items", "report_responses", "thanks"];
    const count = () => tables.map((t) => (db.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c);
    const before = count();
    const outcome = await handleLookback(createScriptedClaude(), db, "saeki", { period: "year" }, NOW);
    expect(outcome.body).toMatchObject({ ready: true });
    expect(count()).toEqual(before);
  });

  it("指示に、出来事を作らず、人と比べない決まりがある", async () => {
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ ready: true, text: "x" }), refused: false };
      },
    };
    await handleLookback(recording, db, "saeki", { period: "year" }, NOW);
    expect(requests[0].system).toContain("出来事、気持ち、成果、数字を作らない");
    expect(requests[0].system).toContain("人と比べない");
  });

  it("材料がなければ Claude を呼ばない", async () => {
    const complete = vi.fn();
    const outcome = await handleLookback({ mode: "real", complete }, db, "fujimoto", { period: "term" }, new Date("2027-05-01T01:00:00Z"));
    expect(outcome.body).toEqual({ ready: false, text: "" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("おかしな期間や失敗は、作らず伝える", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleLookback(createScriptedClaude(), db, "saeki", { period: "x" }, NOW)).status).toBe(400);
    const refused: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    expect((await handleLookback(refused, db, "saeki", { period: "year" }, NOW)).status).toBe(503);
    log.mockRestore();
  });
});
