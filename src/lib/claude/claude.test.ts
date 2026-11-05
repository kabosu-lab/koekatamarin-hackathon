import { describe, expect, it, vi } from "vitest";
import { createAnthropicClaude, MODEL, type MessagesApi } from "./anthropic";
import { converse } from "./converse";
import { createClaude } from "./index";
import { companionSystemPrompt, openingLines, refusalReply, trialCompanionSystemPrompt } from "./persona";
import { createScriptedClaude } from "./scripted";

function stubApi(response: { content: unknown[]; stop_reason: string }) {
  const create = vi.fn().mockResolvedValue(response);
  return { api: { create } as unknown as MessagesApi, create };
}

describe("createClaude", () => {
  it("キーがなければ台本で動く", () => {
    expect(createClaude({}).mode).toBe("scripted");
    expect(createClaude({ ANTHROPIC_API_KEY: "" }).mode).toBe("scripted");
  });

  it("キーがあれば本物を使う", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "test-key" }).mode).toBe("real");
  });

  it("試用では、生徒用はキーがあっても台本、先生用は回数の上限つきの本物", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x" }).mode).toBe("scripted");
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x", KOEKATA_TRIAL_AUDIENCE: "student" }).mode).toBe("scripted");
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x", KOEKATA_TRIAL_AUDIENCE: "teacher" }).mode).toBe("real");
  });

  it("テストの指定があれば、キーがあっても料金を使わない", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "test-key", KOEKATA_CLAUDE: "scripted" }).mode).toBe("scripted");
  });
});

describe("createAnthropicClaude", () => {
  it("決めたモデルと設定で呼び、文章だけを返す", async () => {
    const { api, create } = stubApi({
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "こんにちは！" },
      ],
      stop_reason: "end_turn",
    });

    const result = await createAnthropicClaude(api).complete({
      task: "converse",
      system: "指示",
      messages: [{ role: "user", content: "こんにちは" }],
      maxTokens: 100,
    });

    expect(result).toEqual({ text: "こんにちは！", refused: false });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL,
        max_tokens: 100,
        system: "指示",
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
      }),
    );
  });

  it("安全のために断られたことを伝える", async () => {
    const { api } = stubApi({ content: [], stop_reason: "refusal" });

    const result = await createAnthropicClaude(api).complete({ task: "converse", system: "", messages: [], maxTokens: 100 });

    expect(result).toEqual({ text: "", refused: true });
  });
});

describe("converse", () => {
  it("履歴の後ろに今の発言を足し、相棒の指示で呼ぶ", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "はい", refused: false });
    const history = [
      { role: "user", content: "こんにちは" },
      { role: "assistant", content: "こんにちは！" },
    ] as const;

    await converse({ mode: "scripted", complete }, [...history], "続きです");

    const request = complete.mock.calls[0][0];
    expect(request.system).toBe(companionSystemPrompt);
    expect(request.messages).toEqual([...history, { role: "user", content: "続きです" }]);
  });

  it("断られたときも、空の返事のときも、黙らず言葉を返す", async () => {
    const refused = await converse(
      { mode: "real", complete: async () => ({ text: "", refused: true }) },
      [],
      "……",
    );
    expect(refused).toEqual({ reply: refusalReply, refused: true });

    const empty = await converse(
      { mode: "real", complete: async () => ({ text: "  ", refused: false }) },
      [],
      "……",
    );
    expect(empty).toEqual({ reply: refusalReply, refused: false });
  });
});

describe("最初の一言", () => {
  it("決めた3つを必ず試す", () => {
    expect(openingLines).toEqual(["こんにちは", "あんた何ができるん", "私は嫌やわ"]);
  });

  it("台本の「私は嫌やわ」は売り込まない", async () => {
    const { reply } = await converse(createScriptedClaude(), [], "私は嫌やわ");
    expect(reply).toContain("無理に使わんでええ");
  });

  it("相棒の指示に、人のふりをしない・売り込まない決まりがある", () => {
    expect(companionSystemPrompt).toContain("人のふりをせず");
    expect(companionSystemPrompt).toContain("売り込まない");
    expect(companionSystemPrompt).toContain("連絡した・伝えたと言わない");
    expect(companionSystemPrompt).toContain("要点だけが相談室の先生に届き");
    expect(companionSystemPrompt).toContain("「伝わらない」「大丈夫」と言い切らず");
    // 試用では先生や相談室に届かないので、届くと言わせない。投稿は見えるので、誰にも見られないとも言わせない
    expect(trialCompanionSystemPrompt).toContain("相談室にも先生にも届きません");
    expect(trialCompanionSystemPrompt).toContain("「誰にも伝わらない」「誰にも見られない」と言い切らない");
    expect(trialCompanionSystemPrompt).not.toContain("要点だけが相談室の先生に届き");
    expect(trialCompanionSystemPrompt).toContain("110 番や 119 番");
  });

  it("相棒の指示に、相手のトーンに合わせる決まりがある", () => {
    expect(companionSystemPrompt).toContain("同じトーンで返す");
    expect(companionSystemPrompt).toContain("敬語に戻さず");
    expect(companionSystemPrompt).toContain("相手が使っていない方言は使わない");
  });
});
