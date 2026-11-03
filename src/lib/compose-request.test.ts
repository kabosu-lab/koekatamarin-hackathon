import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient } from "./claude/types";
import { handleDraft, handlePublish, handleReview } from "./compose-request";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { seedDatabase } from "./seed";

const scripted = createScriptedClaude();
let teams: PostDestination;

beforeEach(() => {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function answering(text: string, refused = false): ClaudeClient {
  return { mode: "real", complete: async () => ({ text, refused }) };
}

const quietLog = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("handleDraft", () => {
  it("下書きと受け取られ方を一緒に返す", async () => {
    const outcome = await handleDraft(scripted, teams, "aoki", {
      history: [{ role: "user", content: "過去問を20問解いた" }],
    });
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.draft).toMatchObject({ ready: true, text: "過去問を20問解いた" });
    expect(outcome.body.review?.verdict).toBe("ok");
  });

  it("生徒の下書きの送り先に、教職員だけのチャネルを渡さない", async () => {
    const complete = vi.fn(scripted.complete);
    await handleDraft({ mode: "scripted", complete }, teams, "aoki", {
      history: [{ role: "user", content: "頑張った" }],
    });
    const prompt = JSON.stringify(complete.mock.calls[0][0]);
    expect(prompt).not.toContain("staffroom");
  });

  it("中身がない会話は、下書きにしない", async () => {
    const outcome = await handleDraft(scripted, teams, "aoki", {
      history: [{ role: "user", content: "こんにちは" }],
    });
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.draft.ready).toBe(false);
    expect(outcome.body.review).toBeNull();
  });

  it("Claude の答えにないチャネルや壊れた答えは使わず、失敗として返す", async () => {
    const log = quietLog();
    const badChannel = JSON.stringify({
      ready: true,
      text: "本文",
      channelId: "staffroom",
      kind: "report",
      researchedWithAi: false,
    });
    const history = [{ role: "user", content: "頑張った" }];
    expect((await handleDraft(answering(badChannel), teams, "aoki", { history })).status).toBe(503);
    expect((await handleDraft(answering("{壊れている"), teams, "aoki", { history })).status).toBe(503);
    expect((await handleDraft(answering("", true), teams, "aoki", { history })).status).toBe(503);
    log.mockRestore();
  });

  it("空の履歴は受け付けない", async () => {
    expect((await handleDraft(scripted, teams, "aoki", { history: [] })).status).toBe(400);
  });
});

describe("handleReview", () => {
  it("きつい言葉は消さず、言い換えを出す", async () => {
    const outcome = await handleReview(scripted, { text: "あの人は使えない" });
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.review.verdict).toBe("caution");
    expect(outcome.body.review.alternatives.length).toBeGreaterThan(0);
  });

  it("問題のない文章には言い換えを出さない", async () => {
    const answer = JSON.stringify({ verdict: "ok", perception: "よさそう", alternatives: ["余計な案"] });
    const outcome = await handleReview(answering(answer), { text: "今日は頑張った" });
    expect(outcome.status === 200 && outcome.body.review.alternatives).toEqual([]);
  });
});

describe("handlePublish", () => {
  const input = { text: "今日は頑張りました", channelId: "study", kind: "effort", researchedWithAi: true };

  it("本人の名前で、AI と調べた印を付けて届く", async () => {
    const outcome = await handlePublish(scripted, teams, "aoki", input);
    expect(outcome.status).toBe(200);

    const post = teams.listPosts("aoki", "study").at(-1);
    expect(post).toMatchObject({
      authorName: "青木 ひより",
      body: "今日は頑張りました",
      kind: "effort",
      researchedWithAi: true,
    });
  });

  it("明らかな個人攻撃は、画面を通さない依頼でも止める", async () => {
    const before = teams.listPosts("aoki", "study").length;
    const outcome = await handlePublish(scripted, teams, "aoki", { ...input, text: "佐伯は死ね" });

    expect(outcome.status).toBe(422);
    expect(teams.listPosts("aoki", "study")).toHaveLength(before);
  });

  it("注意の段階では、本人が選べば送れる", async () => {
    const outcome = await handlePublish(scripted, teams, "aoki", { ...input, text: "この制度は使えない" });
    expect(outcome.status).toBe(200);
  });

  it("確かめられないときは送らない", async () => {
    const log = quietLog();
    const before = teams.listPosts("aoki", "study").length;
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };

    expect((await handlePublish(failing, teams, "aoki", input)).status).toBe(503);
    expect((await handlePublish(answering("", true), teams, "aoki", input)).status).toBe(503);
    expect((await handlePublish(answering("読めない"), teams, "aoki", input)).status).toBe(503);
    expect(teams.listPosts("aoki", "study")).toHaveLength(before);
    log.mockRestore();
  });

  it("生徒は教職員だけのチャネルへ送れない", async () => {
    const outcome = await handlePublish(scripted, teams, "aoki", { ...input, channelId: "staffroom" });
    expect(outcome.status).toBe(400);
    expect(teams.listPosts("saeki", "staffroom").map((p) => p.body)).not.toContain(input.text);
  });
});
