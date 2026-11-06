import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient } from "./claude/types";
import { readPartialString, TooLongError } from "./claude/compose";
import { type DraftStreamEvent, handleDraft, handlePublish, handleReview, prepareDraftStream } from "./compose-request";
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

describe("prepareDraftStream（0-2l）", () => {
  async function collect(claude: ClaudeClient, input: unknown) {
    const prepared = prepareDraftStream(claude, teams, "aoki", input);
    if (prepared.status !== 200) return { status: prepared.status, events: [] as DraftStreamEvent[] };
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => events.push(event));
    return { status: 200, events };
  }

  it("送り先を先に、本文を少しずつ、最後に下書きと受け取られ方を流す", async () => {
    const { events } = await collect(scripted, { history: [{ role: "user", content: "過去問を20問解いた" }] });
    expect(events[0].type).toBe("start");
    const deltas = events.filter((event) => event.type === "delta");
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((event) => (event.type === "delta" ? event.text : "")).join("")).toBe("過去問を20問解いた");
    const types = events.map((event) => event.type);
    expect(types.indexOf("channel")).toBeLessThan(types.indexOf("delta"));
    expect(types.slice(-2)).toEqual(["draft", "review"]);
  });

  it("本物の Claude が流すときは、書きかけの JSON から本文だけを取り出す", async () => {
    const json = JSON.stringify({ ready: true, channelId: "study", kind: "report", researchedWithAi: false, announcement: false, text: "改行も\n\"引用\"も" });
    const claude: ClaudeClient = {
      mode: "real",
      complete: scripted.complete,
      stream: async (request, onText) => {
        if (request.task !== "draft") throw new Error("下書きだけを流す");
        for (let i = 0; i < json.length; i += 5) onText(json.slice(i, i + 5));
        return { text: json, refused: false };
      },
    };
    const { events } = await collect(claude, { history: [{ role: "user", content: "x" }] });
    const body = events.flatMap((event) => (event.type === "delta" ? [event.text] : [])).join("");
    expect(body).toBe("改行も\n\"引用\"も");
    expect(events.find((event) => event.type === "channel")).toEqual({ type: "channel", channelId: "study" });
  });

  it("確かめで止まるものは流さず、Claude の失敗は error として流す", async () => {
    expect((await collect(scripted, { history: [] })).status).toBe(400);
    const log = quietLog();
    const { events } = await collect(answering("壊れた答え"), { history: [{ role: "user", content: "x" }] });
    expect(events.at(-1)?.type).toBe("error");
    log.mockRestore();
  });
});

describe("prepareDraftStream の中断と失敗（0-2l の見直し）", () => {
  const history = { history: [{ role: "user", content: "過去問を20問解いた" }] };

  it("止められたら、受け取られ方の確かめをせず、残りを流さない", async () => {
    const complete = vi.fn(scripted.complete);
    const prepared = prepareDraftStream({ mode: "scripted", complete }, teams, "aoki", history);
    if (prepared.status !== 200) throw new Error("流れるはず");
    const stop = new AbortController();
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => {
      events.push(event);
      if (event.type === "delta") stop.abort();
    }, stop.signal);
    expect(events.filter((event) => event.type === "delta")).toHaveLength(1);
    expect(events.some((event) => event.type === "draft" || event.type === "review")).toBe(false);
    expect(complete.mock.calls.map(([request]) => request.task)).toEqual(["draft"]);
  });

  it("本文のあとで確かめに失敗しても、下書きは捨てず、確かめ直せるように知らせる", async () => {
    const log = quietLog();
    const claude: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        if (request.task === "review") throw new Error("つながらない");
        return scripted.complete(request);
      },
    };
    const prepared = prepareDraftStream(claude, teams, "aoki", history);
    if (prepared.status !== 200) throw new Error("流れるはず");
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => events.push(event));
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(events.find((event) => event.type === "draft")).toBeTruthy();
    expect(events.at(-1)).toEqual({ type: "review", review: null, failed: true });
    log.mockRestore();
  });

  it("上限まで書いても終わらなかったら、長すぎたと分けて知らせる", async () => {
    const claude: ClaudeClient = {
      mode: "real",
      complete: scripted.complete,
      stream: async () => {
        throw new TooLongError("長すぎ");
      },
    };
    const prepared = prepareDraftStream(claude, teams, "aoki", history);
    if (prepared.status !== 200) throw new Error("流れるはず");
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => events.push(event));
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect(last?.type === "error" && last.error).toContain("短く");
  });
});

describe("readPartialString", () => {
  it("書きかけの文字列を、読めたところまで返す", () => {
    expect(readPartialString('{"ready":true,"te', "text")).toBeNull();
    expect(readPartialString('{"text":"あい\\', "text")).toEqual({ value: "あい", done: false });
    expect(readPartialString('{"text":"あい\\nう\\u00', "text")).toEqual({ value: "あい\nう", done: false });
    expect(readPartialString('{"text":"\\u3042\\"x\\"","k":1}', "text")).toEqual({ value: 'あ"x"', done: true });
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
