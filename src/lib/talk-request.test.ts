import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient } from "./claude/types";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";
import { handleTalk, speakerForPrompt } from "./talk-request";

const NOW = new Date("2026-11-04T01:00:00Z");
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("話している人（0-2c）", () => {
  it("生徒か先生かだけを渡し、名前は渡さない", () => {
    expect(speakerForPrompt(db, "saeki")).toBe("話している人：先生");
    expect(speakerForPrompt(db, "aoki")).toBe("話している人：生徒");
    expect(speakerForPrompt(db, "nobody")).toBe("");
  });

  it("パートナーへの指示に「話している人」の行が添えられる", async () => {
    let system = "";
    const claude: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        if (request.task === "converse") system = request.system;
        return { text: request.task === "safety" ? JSON.stringify({ category: "none" }) : "はい", refused: false };
      },
    };
    await handleTalk(claude, db, "saeki", { history: [], text: "まじしんどいわー" }, NOW);
    expect(system).toMatch(/^話している人：先生$/m);
  });

  it("台本でも、先生には丁寧語、生徒にはくだけた言葉で返す", async () => {
    const scripted = createScriptedClaude();
    const teacher = await handleTalk(scripted, db, "saeki", { history: [], text: "私は嫌やわ" }, NOW);
    const student = await handleTalk(scripted, db, "aoki", { history: [], text: "私は嫌やわ" }, NOW);
    expect(JSON.stringify(teacher.body)).toContain("無理に使わなくて大丈夫ですよ");
    expect(JSON.stringify(student.body)).toContain("無理に使わんでええ");
  });
});
