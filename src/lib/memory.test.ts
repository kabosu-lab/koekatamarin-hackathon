import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { buildDirectory, handleConnect } from "./connect";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { handleMemory, listMemories, memoryForPrompt } from "./memory";
import { handleProfile } from "./profile";
import { seedDatabase } from "./seed";
import { handleTalk } from "./talk-request";

const NOW = new Date("2026-11-04T01:00:00Z");
const SECRET = "本人だけに話した覚えておいてほしいこと";
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function recording(answer: unknown = { moment: "none", personId: "aoki", message: "" }) {
  const requests: ClaudeRequest[] = [];
  const claude: ClaudeClient = {
    mode: "real",
    complete: async (request) => {
      requests.push(request);
      if (request.task === "converse") return { text: "聞いてるよ", refused: false };
      if (request.task === "safety") return { text: '{"category":"none"}', refused: false };
      return { text: JSON.stringify(answer), refused: false };
    },
  };
  return { claude, requests };
}

const conversePrompt = (requests: ClaudeRequest[]) => requests.find((r) => r.task === "converse")?.system ?? "";

describe("話しただけのこと", () => {
  it("話すだけでは残らない", async () => {
    await handleTalk(createScriptedClaude(), db, "noda", { history: [], text: SECRET }, NOW);
    expect(JSON.stringify(listMemories(db, teams, "noda"))).not.toContain(SECRET);
    expect(memoryForPrompt(db, teams, "noda")).not.toContain(SECRET);
  });

  it("本人が「覚えて」と頼むと残り、本人との話に使う", async () => {
    expect(handleMemory(db, "noda", { action: "remember", text: SECRET }, NOW).status).toBe(200);
    expect(listMemories(db, teams, "noda")[0]).toMatchObject({ kind: "spoken", text: SECRET });

    const { claude, requests } = recording();
    await handleTalk(claude, db, "noda", { history: [], text: "こんにちは" }, NOW);
    expect(conversePrompt(requests)).toContain(SECRET);
  });

  it("他の人との話、人の紹介、プロフィールには使わない", async () => {
    handleMemory(db, "noda", { action: "remember", text: SECRET }, NOW);

    const other = recording();
    await handleTalk(other.claude, db, "saeki", { history: [], text: "こんにちは" }, NOW);
    expect(JSON.stringify(other.requests)).not.toContain(SECRET);
    expect(listMemories(db, teams, "saeki").map((m) => m.text)).not.toContain(SECRET);

    expect(JSON.stringify(buildDirectory(db, teams, "saeki"))).not.toContain(SECRET);
    const connect = recording();
    await handleConnect(connect.claude, db, teams, "saeki", {
      history: [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
        { role: "assistant", content: "d" },
      ],
    }, NOW);
    expect(JSON.stringify(connect.requests)).not.toContain(SECRET);

    const profile = recording({ ready: false, text: "" });
    await handleProfile(profile.claude, db, teams, "noda", { action: "draft" });
    expect(JSON.stringify(profile.requests)).not.toContain(SECRET);
  });

  it("相棒の安全の確認にも入れない", async () => {
    handleMemory(db, "noda", { action: "remember", text: SECRET }, NOW);
    const { claude, requests } = recording();
    await handleTalk(claude, db, "noda", { history: [], text: "こんにちは" }, NOW);
    expect(JSON.stringify(requests.filter((r) => r.task === "safety"))).not.toContain(SECRET);
  });
});

describe("公開したこと", () => {
  it("本人との話と、人の紹介に使う", async () => {
    const { claude, requests } = recording();
    await handleTalk(claude, db, "noda", { history: [], text: "こんにちは" }, NOW);
    expect(conversePrompt(requests)).toContain("ネットワークは最後まで苦手");
    expect(JSON.stringify(buildDirectory(db, teams, "saeki"))).toContain("ネットワークは最後まで苦手");
  });

  it("範囲を絞った投稿は覚えない", () => {
    teams.createPost("noda", "study", "範囲を絞った言葉", { scope: "self" });
    expect(JSON.stringify(listMemories(db, teams, "noda"))).not.toContain("範囲を絞った言葉");
  });
});

describe("一覧と消去", () => {
  it("覚えてと頼んだことは、本人だけが消せる", () => {
    handleMemory(db, "noda", { action: "remember", text: SECRET }, NOW);
    const [memory] = listMemories(db, teams, "noda");
    expect(handleMemory(db, "saeki", { action: "forget", kind: "spoken", id: memory.id }).status).toBe(404);
    expect(handleMemory(db, "noda", { action: "forget", kind: "spoken", id: memory.id }).status).toBe(200);
    expect(JSON.stringify(listMemories(db, teams, "noda"))).not.toContain(SECRET);
  });

  it("公開した言葉を忘れてと言うと、話にも紹介にもプロフィールにも使わず、投稿は残る", async () => {
    const reply = listMemories(db, teams, "noda").find((m) => m.text.includes("最後まで苦手"));
    expect(handleMemory(db, "noda", { action: "forget", kind: "published", id: reply?.id }).status).toBe(200);

    expect(memoryForPrompt(db, teams, "noda")).not.toContain("最後まで苦手");
    expect(JSON.stringify(buildDirectory(db, teams, "saeki"))).not.toContain("最後まで苦手");
    const profile = recording({ ready: false, text: "" });
    await handleProfile(profile.claude, db, teams, "noda", { action: "draft" });
    expect(JSON.stringify(profile.requests)).not.toContain("最後まで苦手");
    expect(JSON.stringify(teams.listPosts("noda", "study"))).toContain("最後まで苦手");
  });

  it("他の人の「忘れて」は、自分の言葉に影響しない", () => {
    const reply = listMemories(db, teams, "noda").find((m) => m.text.includes("最後まで苦手"));
    handleMemory(db, "saeki", { action: "forget", kind: "published", id: reply?.id });
    expect(memoryForPrompt(db, teams, "noda")).toContain("最後まで苦手");
  });

  it("おかしな依頼は受け付けない", () => {
    expect(handleMemory(db, "noda", { action: "remember", text: " " }).status).toBe(400);
    expect(handleMemory(db, "noda", { action: "x" }).status).toBe(400);
    expect(handleMemory(db, "noda", { action: "forget", id: "x", kind: "y" }).status).toBe(400);
  });
});
