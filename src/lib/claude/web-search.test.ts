import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { speakerForPrompt } from "../talk-request";
import { createAnthropicClaude, textWithSources, webSearchOptionsFromEnv, type MessagesApi, type WebSearchOptions } from "./anthropic";
import { companionSystemPrompt, sourceMark, trialCompanionSystemPrompt } from "./persona";

function options(overrides: Partial<WebSearchOptions> = {}): WebSearchOptions {
  return { enabled: true, perHour: 10, now: () => 0, log: [], ...overrides };
}

function stubApi(...responses: { content: unknown[]; stop_reason: string }[]) {
  const create = vi.fn();
  for (const response of responses) create.mockResolvedValueOnce(response);
  return { api: { create } as unknown as MessagesApi, create };
}

const ok = { content: [{ type: "text", text: "はい" }], stop_reason: "end_turn" };
const converseRequest = { task: "converse" as const, system: "指示", messages: [{ role: "user" as const, content: "調べて" }], maxTokens: 100 };

describe("調べもの（Web 検索）", () => {
  it("パートナーとの会話には、Web 検索の道具を渡す", async () => {
    const { api, create } = stubApi(ok);
    await createAnthropicClaude(api, options()).complete(converseRequest);
    const tools = create.mock.calls[0][0].tools;
    expect(tools).toEqual([expect.objectContaining({ type: "web_search_20250305", name: "web_search", max_uses: 2 })]);
  });

  it("会話以外の呼び出しや、JSON で返させる呼び出しには渡さない", async () => {
    const { api, create } = stubApi(ok, ok);
    const claude = createAnthropicClaude(api, options());
    await claude.complete({ ...converseRequest, task: "safety" });
    await claude.complete({ ...converseRequest, jsonSchema: { type: "object" } });
    expect(create.mock.calls[0][0].tools).toBeUndefined();
    expect(create.mock.calls[1][0].tools).toBeUndefined();
  });

  it("上限は実際に調べた回数で数え、超えたら道具を渡さずにふつうに話す。1時間たてば戻る", async () => {
    const searched = { ...ok, usage: { server_tool_use: { web_search_requests: 2 } } };
    const { api, create } = stubApi(ok, ok, searched, ok, ok);
    let now = 0;
    const claude = createAnthropicClaude(api, options({ perHour: 2, now: () => now }));
    await claude.complete(converseRequest); // 調べていない回は数えない
    await claude.complete(converseRequest);
    await claude.complete(converseRequest); // ここで2回調べた
    await claude.complete(converseRequest);
    now = 60 * 60 * 1000 + 1;
    await claude.complete(converseRequest);
    expect(create.mock.calls[2][0].tools).toBeDefined();
    expect(create.mock.calls[3][0].tools).toBeUndefined();
    expect(create.mock.calls[4][0].tools).toBeDefined();
  });

  it("上限は試用版・審査員用だけ。止める指定があれば渡さない", async () => {
    expect(webSearchOptionsFromEnv({}).perHour).toBe(Infinity);
    expect(webSearchOptionsFromEnv({ KOEKATA_ACCESS_CODE: "x" }).perHour).toBe(30);
    expect(webSearchOptionsFromEnv({ KOEKATA_ACCESS_CODE: "x", KOEKATA_WEB_SEARCH_PER_HOUR: "5" }).perHour).toBe(5);
    expect(webSearchOptionsFromEnv({ KOEKATA_WEB_SEARCH: "off" }).enabled).toBe(false);
    const { api, create } = stubApi(ok);
    await createAnthropicClaude(api, options({ enabled: false })).complete(converseRequest);
    expect(create.mock.calls[0][0].tools).toBeUndefined();
  });

  it("出典を、同じ URL は1つにまとめて、返事の最後に印として付ける", () => {
    const cite = (url: string, title: string | null) => ({ type: "web_search_result_location", url, title, cited_text: "", encrypted_index: "" });
    const text = textWithSources([
      { type: "server_tool_use" },
      { type: "web_search_tool_result" },
      { type: "text", text: "例のページによると、", citations: null },
      { type: "text", text: "こうらしいよ。", citations: [cite("https://example.com/a", "例のページ")] },
      { type: "text", text: "たぶんね。", citations: [cite("https://example.com/a", "例のページ"), cite("https://example.org/b", null)] },
    ] as never);
    expect(text).toBe(
      `例のページによると、こうらしいよ。たぶんね。\n${sourceMark("例のページ", "https://example.com/a")}\n${sourceMark("https://example.org/b", "https://example.org/b")}`,
    );
    expect(sourceMark("a|b]]c", "https://example.com")).toBe("[[出典:a b  c|https://example.com]]");
  });

  it("調べたのに引用がなければ、最後の検索の上から2つを出典にする。調べていなければ何も足さない", () => {
    const result = (url: string) => ({ type: "web_search_result", url, title: `題 ${url}`, encrypted_content: "", page_age: null });
    const text = textWithSources([
      { type: "web_search_tool_result", content: [result("https://old.example")] },
      { type: "web_search_tool_result", content: [result("https://a.example"), result("https://b.example"), result("https://c.example")] },
      { type: "text", text: "こうみたい。", citations: null },
    ] as never);
    expect(text).toBe(`こうみたい。\n${sourceMark("題 https://a.example", "https://a.example")}\n${sourceMark("題 https://b.example", "https://b.example")}`);
    expect(textWithSources([{ type: "text", text: "やあ", citations: null }] as never)).toBe("やあ");
    // 検索の失敗（中身が配列でない）は出典にしない
    expect(textWithSources([{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } }, { type: "text", text: "調べられなかった", citations: null }] as never)).toBe("調べられなかった");
  });

  it("調べものが途中で止まったら、言葉を足さずに続けさせる", async () => {
    const { api, create } = stubApi(
      { content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }], stop_reason: "pause_turn" },
      { content: [{ type: "text", text: "わかったよ。" }], stop_reason: "end_turn" },
    );
    const result = await createAnthropicClaude(api, options()).complete(converseRequest);
    expect(result).toEqual({ text: "わかったよ。", refused: false });
    const resumed = create.mock.calls[1][0].messages;
    expect(resumed).toHaveLength(2);
    expect(resumed[1]).toEqual({ role: "assistant", content: [expect.objectContaining({ type: "server_tool_use" })] });
  });
});

describe("話し方の決まり（問い詰めない・話の種類）", () => {
  it.each([companionSystemPrompt, trialCompanionSystemPrompt])("質問を続けない、光ったら掘り下げない、区切りで閉じる", (prompt) => {
    expect(prompt).toContain("直前の2回が続けて質問で終わっていたら、今回は質問をしない");
    expect(prompt).toContain("それ以上掘り下げない");
    expect(prompt).toContain("とどける？ もう少し話す？");
    expect(prompt).toContain("聞き返さずに受け止めて、言い切りで返す");
    expect(prompt).toContain("質問や新しい提案で引き止めない");
    expect(prompt).not.toContain("問い返して相手の考えを深める");
  });

  it.each([companionSystemPrompt, trialCompanionSystemPrompt])("聞く・壁打ち・調べもの、生徒には答えをすぐ言わない", (prompt) => {
    expect(prompt).toContain("壁打ち");
    expect(prompt).toContain("web_search");
    expect(prompt).toContain("1回はヒントで返す");
    expect(prompt).toContain("先生のとき");
    expect(prompt).toContain("同じトーンで返す");
    expect(prompt).toContain("110 番や 119 番");
  });

  it("話している人が生徒か先生かを、名前なしで渡す", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE people (id TEXT, name TEXT, role TEXT, label TEXT)");
    db.prepare("INSERT INTO people VALUES (?, ?, ?, ?)").run("s1", "ダミー生徒", "student", "");
    db.prepare("INSERT INTO people VALUES (?, ?, ?, ?)").run("t1", "ダミー先生", "teacher", "");
    expect(speakerForPrompt(db, "s1")).toBe("話している人：生徒");
    expect(speakerForPrompt(db, "t1")).toBe("話している人：先生");
    expect(speakerForPrompt(db, "none")).toBe("");
  });
});
