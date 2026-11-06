import { afterEach, describe, expect, it, vi } from "vitest";
import { converse, splitFeedback } from "./claude/converse";
import { handleConverse } from "./claude/converse-request";
import { companionSystemPrompt, FEEDBACK_MARK, trialCompanionSystemPrompt, trialFeedbackRules } from "./claude/persona";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { isFeedbackConsent } from "./feedback-consent";
import { collectsFeedback } from "./trial";

afterEach(() => vi.unstubAllEnvs());

/** 決めた返事を返し、渡された指示を覚えておく */
function fixed(text: string) {
  const seen: ClaudeRequest[] = [];
  const client: ClaudeClient = {
    mode: "scripted",
    async complete(request) {
      seen.push(request);
      return { text, refused: false };
    },
  };
  return { client, seen };
}

function trial(feedback?: "off") {
  vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
  vi.stubEnv("KOEKATA_FEEDBACK", feedback ?? "");
}

describe("届けてよいかへの返事（同意の判定）", () => {
  it.each(["いいよ", "うん", "うん、いいよ", "お願いします", "はい", "はい！", "ええよ", "OK", "ok!", "どうぞ", "もちろん", "ぜひ", "届けて", "送っていいよ", "いいですよ", "了解", "よろしく"])(
    "「%s」は同意",
    (text) => expect(isFeedbackConsent(text)).toBe(true),
  );

  it.each([
    "いいえ",
    "いや",
    "いやだ",
    "やめて",
    "ダメ",
    "だめ",
    "嫌",
    "遠慮しとく",
    "結構です",
    "ちょっと待って",
    "まだいい",
    "送らないで",
    "もういい",
    "いらない",
    "",
    "そういえば昨日の部活で先輩がすごく良いことを言っていて、それがずっと頭に残ってるんだよね",
    "今日は雨",
  ])("「%s」は同意ではない", (text) => expect(isFeedbackConsent(text)).toBe(false));
});

describe("感想を集めるか", () => {
  it("試用版だけ。審査員用（KOEKATA_FEEDBACK=off）と本番では集めない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "");
    expect(collectsFeedback()).toBe(false);
    trial();
    expect(collectsFeedback()).toBe(true);
    trial("off");
    expect(collectsFeedback()).toBe(false);
  });
});

describe("[[感想]] の印", () => {
  it("印を取り除き、あったかを返す", () => {
    expect(splitFeedback(`それ、作っている人に届けてもいい？\n${FEEDBACK_MARK}`)).toEqual({ text: "それ、作っている人に届けてもいい？", feedback: true });
    expect(splitFeedback("ふつうの返事")).toEqual({ text: "ふつうの返事", feedback: false });
  });

  it("試用版では印を読み、決まりを指示に足す。とどけるの印と一緒でも両方読む", async () => {
    trial();
    const { client, seen } = fixed(`届けてもいい？\n${FEEDBACK_MARK}\n[[とどけられる:1]]`);
    const result = await converse(client, [], "このアプリ、ボタンが小さくて押しにくい");
    expect(result).toMatchObject({ reply: "届けてもいい？", feedback: true, ready: true, level: 1 });
    expect(seen[0].system).toContain(trialFeedbackRules);
    expect(seen[0].system).toContain("作っている人に届けてもいいですか？");
  });

  it("審査員用と本番では、印があっても feedback にせず、印も画面に出さない。決まりも足さない", async () => {
    for (const setup of [() => trial("off"), () => vi.stubEnv("KOEKATA_ACCESS_CODE", "")]) {
      setup();
      const { client, seen } = fixed(`届けてもいい？\n${FEEDBACK_MARK}`);
      const result = await converse(client, [], "このアプリ使いにくい");
      expect(result.feedback).toBeUndefined();
      expect(result.reply).toBe("届けてもいい？");
      expect(seen[0].system).not.toContain(FEEDBACK_MARK);
    }
    expect(companionSystemPrompt).not.toContain(FEEDBACK_MARK);
    expect(trialCompanionSystemPrompt).not.toContain(FEEDBACK_MARK);
  });

  it("命や安全に関わる言葉のときは、印があっても預からない", async () => {
    trial();
    const { client } = fixed(`届けてもいい？\n${FEEDBACK_MARK}`);
    expect((await converse(client, [], "このアプリ使いにくいし、もう死にたい")).feedback).toBeUndefined();
  });

  it("画面への返事に feedback が付く", async () => {
    trial();
    const { client } = fixed(`届けてもいい？\n${FEEDBACK_MARK}`);
    const outcome = await handleConverse(client, { history: [], text: "このアプリ分かりにくい" });
    expect(outcome).toMatchObject({ status: 200, body: { feedback: true, reply: "届けてもいい？" } });
  });

  it("台本でも、アプリへの感想には聞いて印を付け、次の返事にはお礼だけ言う", async () => {
    trial();
    const claude = createScriptedClaude();
    const asked = await converse(claude, [], "このアプリ、ボタンが分かりにくい");
    expect(asked.feedback).toBe(true);
    expect(asked.reply).toContain("作っている人に届けてもいい？");
    expect(asked.reply).not.toContain("[[");
    const thanks = await converse(
      claude,
      [
        { role: "user", content: "このアプリ、ボタンが分かりにくい" },
        { role: "assistant", content: asked.reply },
      ],
      "いいよ",
    );
    expect(thanks.reply).toBe("わかった、ありがとう！");
    expect(thanks.feedback).toBeUndefined();
  });
});
