import { afterEach, describe, expect, it, vi } from "vitest";
import { converse, sayDelivered, splitFeedback } from "./claude/converse";
import { handleConverse } from "./claude/converse-request";
import { companionSystemPrompt, FEEDBACK_DELIVERED_MARK, FEEDBACK_MARK, trialCompanionSystemPrompt, trialFeedbackRules } from "./claude/persona";
import { createScriptedClaude } from "./claude/scripted";
import type { ChatMessage, ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { saveTalkFeedback } from "./feedback";
import { isFeedbackConsent, isFeedbackDecline, talkFeedbackToDeliver } from "./feedback-consent";
import { seedDatabase } from "./seed";
import { handleTalk } from "./talk-request";
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
    expect(splitFeedback(`それ、作っている人に届けてもいい？\n${FEEDBACK_MARK}`)).toEqual({ text: "それ、作っている人に届けてもいい？", feedback: true, delivered: false });
    expect(splitFeedback("ふつうの返事")).toEqual({ text: "ふつうの返事", feedback: false, delivered: false });
    expect(splitFeedback(`届けたよ、ありがとう！\n${FEEDBACK_DELIVERED_MARK}`)).toEqual({ text: "届けたよ、ありがとう！", feedback: false, delivered: true });
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

  it("台本でも、アプリへの感想には聞いて印を付け、いいよなら届けたと言い切って本人の言葉を預ける", async () => {
    trial();
    const claude = createScriptedClaude();
    const asked = await converse(claude, [], "このアプリ、ボタンが分かりにくい");
    expect(asked.feedback).toBe(true);
    expect(asked.deliver).toBeUndefined();
    expect(asked.reply).toContain("作っている人に届けてもいい？");
    expect(asked.reply).not.toContain("[[");
    const history: ChatMessage[] = [
      { role: "user", content: "このアプリ、ボタンが分かりにくい" },
      { role: "assistant", content: asked.reply },
    ];
    const thanks = await converse(claude, history, "届けてください");
    expect(thanks.reply).toBe("届けたよ、ありがとう！");
    expect(thanks.deliver).toBe("このアプリ、ボタンが分かりにくい");
    expect(thanks.feedback).toBeUndefined();
    expect(thanks.reply).not.toMatch(/画面から|自分では|送れない/);

    const declined = await converse(claude, history, "いや、やめとく");
    expect(declined.deliver).toBeUndefined();
    expect(declined.reply).not.toContain("届けたよ");
  });

  it("台本でも、先生には「届けました。ありがとうございます」", async () => {
    trial();
    const claude = createScriptedClaude();
    const history: ChatMessage[] = [
      { role: "user", content: "このアプリ、文字が分かりにくい" },
      { role: "assistant", content: "それ、作っている人に届けてもいいですか？" },
    ];
    const done = await converse(claude, history, "お願いします", "話している人：先生");
    expect(done.reply).toBe("届けました。ありがとうございます。");
    expect(done.deliver).toBe("このアプリ、文字が分かりにくい");
  });
});

describe("届ける本人の言葉を決める（0-3l (2)）", () => {
  const asked: ChatMessage[] = [
    { role: "user", content: "この画面、見づらいんだよね" },
    { role: "assistant", content: "それ、作っている人に届けてもいい？ 名前は届かないよ。" },
  ];

  it("聞いたあとに同意したら、印がなくても、その前の本人の言葉", () => {
    expect(talkFeedbackToDeliver(asked, "届けてください", false)).toBe("この画面、見づらいんだよね");
    expect(talkFeedbackToDeliver(asked, "届けてもらっていいですか", true)).toBe("この画面、見づらいんだよね");
  });

  it("断ったら、印があっても届けない", () => {
    expect(isFeedbackDecline("いや、やめとく")).toBe(true);
    expect(talkFeedbackToDeliver(asked, "いや、やめとく", true)).toBeNull();
    expect(talkFeedbackToDeliver(asked, "送らないで", false)).toBeNull();
  });

  it("聞いていないときのいいよは届けない。別の人に伝えてよいかの問いとも取り違えない", () => {
    expect(talkFeedbackToDeliver([], "いいよ", false)).toBeNull();
    const other: ChatMessage[] = [
      { role: "user", content: "部活の先輩がすごかった" },
      { role: "assistant", content: "それ、先生に伝えてもいい？" },
    ];
    expect(talkFeedbackToDeliver(other, "うん", false)).toBeNull();
  });

  it("自分から頼んだら、印があるときだけ、その言葉を届ける", () => {
    expect(talkFeedbackToDeliver([], "このアプリの文字が小さいって届けて", true)).toBe("このアプリの文字が小さいって届けて");
    expect(talkFeedbackToDeliver([], "このアプリの文字が小さいって届けて", false)).toBeNull();
  });

  it("届けたと言い切っていない返事には、頭に言い切りを足す", () => {
    expect(sayDelivered("ありがとう！", false)).toBe("届けたよ、ありがとう！\nありがとう！");
    expect(sayDelivered("ありがとうございます。", true)).toBe("届けました。ありがとうございます。\nありがとうございます。");
    expect(sayDelivered("届けたよ、ありがとう", false)).toBe("届けたよ、ありがとう");
  });

  it("本物の Claude が印を付けなくても、聞いたあとの同意なら届けて言い切る", async () => {
    trial();
    const { client } = fixed("ありがとう！");
    const result = await converse(client, asked, "いいよ");
    expect(result.deliver).toBe("この画面、見づらいんだよね");
    expect(result.reply.startsWith("届けたよ、ありがとう！")).toBe(true);
  });

  it("審査員用と本番では、同意しても預からない", async () => {
    for (const setup of [() => trial("off"), () => vi.stubEnv("KOEKATA_ACCESS_CODE", "")]) {
      setup();
      const { client } = fixed(`届けたよ\n${FEEDBACK_DELIVERED_MARK}`);
      const result = await converse(client, asked, "いいよ");
      expect(result.deliver).toBeUndefined();
      expect(result.reply).toBe("届けたよ");
    }
  });
});

describe("話の中の感想をサーバーで残す（0-3l (2)）", () => {
  const NOW = new Date("2026-11-07T08:00:00Z");
  const rows = (db: ReturnType<typeof openDatabase>) =>
    db.prepare("SELECT kind, body, path, screen_width FROM trial_feedback").all() as Record<string, unknown>[];

  it("同意した返事の中で、本人の言葉と画面の場所だけを1件残し、画面には feedbackSaved だけ返す", async () => {
    trial();
    const db = openDatabase(":memory:");
    seedDatabase(db);
    const claude = createScriptedClaude();
    const history: ChatMessage[] = [
      { role: "user", content: "このアプリ、ボタンが分かりにくい" },
      { role: "assistant", content: "教えてくれてありがとう。それ、作っている人に届けてもいい？ 名前は届かないよ。" },
    ];
    const outcome = await handleTalk(claude, db, "aoki", { history, text: "届けてください", path: "/?x=1", screenWidth: 412 }, NOW);
    expect(outcome.body).toMatchObject({ reply: "届けたよ、ありがとう！", feedbackSaved: true });
    expect(JSON.stringify(outcome.body)).not.toContain("ボタンが分かりにくい");
    expect(rows(db)).toEqual([{ kind: "話の中で", body: "このアプリ、ボタンが分かりにくい", path: "/", screen_width: 412 }]);

    // 同じ同意をもう一度送っても、二重に残さない
    const again = await handleTalk(claude, db, "aoki", { history, text: "届けてください", path: "/" }, NOW);
    expect(again.body).not.toHaveProperty("feedbackSaved");
    expect(rows(db)).toHaveLength(1);
  });

  it("断ったとき・聞いていないときは残さない。場所がなければ画面の道を使う", async () => {
    trial();
    const db = openDatabase(":memory:");
    seedDatabase(db);
    const claude = createScriptedClaude();
    const history: ChatMessage[] = [
      { role: "user", content: "このアプリ、文字が小さくて分かりにくい" },
      { role: "assistant", content: "それ、作っている人に届けてもいい？" },
    ];
    await handleTalk(claude, db, "aoki", { history, text: "いや、やめとく" }, NOW);
    await handleTalk(claude, db, "aoki", { history: [], text: "いいよ" }, NOW);
    expect(rows(db)).toHaveLength(0);
    await handleTalk(claude, db, "aoki", { history, text: "うん" }, NOW, "/walk");
    expect(rows(db)).toEqual([{ kind: "話の中で", body: "このアプリ、文字が小さくて分かりにくい", path: "/walk", screen_width: null }]);
  });

  it("saveTalkFeedback は同じ言葉を二重に残さない", () => {
    const db = openDatabase(":memory:");
    expect(saveTalkFeedback(db, { body: "見づらい", path: "/" }, NOW)).toBe(true);
    expect(saveTalkFeedback(db, { body: "見づらい", path: "/me" }, NOW)).toBe(false);
    expect(saveTalkFeedback(db, { body: "", path: "/" }, NOW)).toBe(false);
    expect(rows(db)).toHaveLength(1);
  });
});
