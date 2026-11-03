import { openingLines } from "./persona";
import type { ClaudeClient } from "./types";

const fallbackReply = "なるほど、聞かせてくれてありがとう。もう少し詳しく教えてもらえますか？";

const replies: Record<(typeof openingLines)[number], string> = {
  こんにちは: "こんにちは！今日はどんな一日でしたか？",
  あんた何ができるん: "話聞くんと、もやもやを言葉にするんが得意やで。今なんかある？",
  私は嫌やわ: "そっか、嫌かあ。無理に使わんでええよ。どのへんが嫌やった？",
};

function scriptedDraft(transcript: string, jsonSchema: Record<string, unknown> | undefined) {
  const spoken = [...transcript.matchAll(/^本人：(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => !(openingLines as readonly string[]).includes(line));
  const properties = (jsonSchema?.properties ?? {}) as { channelId?: { enum?: string[] } };
  const channels = properties.channelId?.enum ?? [];
  return {
    ready: spoken.length > 0,
    text: spoken.join("\n"),
    // 全校のお知らせの次にある、話題のチャネルを選ぶ
    channelId: channels[1] ?? channels[0] ?? "",
    kind: "report",
    researchedWithAi: spoken.some((line) => line.includes("調べ")),
  };
}

function scriptedReply(prompt: string) {
  const spoken = prompt.slice(prompt.indexOf("<本人の話>") + "<本人の話>".length, prompt.indexOf("</本人の話>")).trim();
  if (/わからん|知らん|どうしよ/.test(spoken)) {
    return { kind: "ask_back", text: "", question: "あなたのときはどうでしたか？ちょっとしたことでも大丈夫です。" };
  }
  return { kind: "reply", text: spoken, question: "" };
}

function scriptedConnect(prompt: string, jsonSchema: Record<string, unknown> | undefined) {
  const properties = (jsonSchema?.properties ?? {}) as { personId?: { enum?: string[] } };
  const personId = properties.personId?.enum?.[0] ?? "";
  const conversation = [...prompt.matchAll(/^本人：(.*)$/gm)].map((match) => match[1]).join("\n");
  const moment = /解決|わかった|ありがとう/.test(conversation)
    ? "resolved"
    : /煮詰ま|行き詰|わからん/.test(conversation)
      ? "stuck"
      : "none";
  return { moment, personId, message: moment === "none" ? "" : "この話、くわしい人にも聞いてみる？" };
}

function scriptedSafety(conversation: string) {
  if (/死にたい|消えたい|自殺/.test(conversation)) return { category: "self_harm" };
  if (/殴られ|虐待/.test(conversation)) return { category: "violence_or_abuse" };
  return { category: "none" };
}

function scriptedReview(post: string) {
  if (/死ね|消えろ|殺す/.test(post)) {
    return {
      verdict: "block",
      perception: "相手をひどく傷つける言葉が入っているから、これは送れないよ。何があったか、先に聞かせて。",
      alternatives: [],
    };
  }
  if (/バカ|使えない|ムカつく/.test(post)) {
    return {
      verdict: "caution",
      perception: "読んだ人には、責められているように受け取られるかも。",
      alternatives: ["ちょっと困っていて、一緒に考えてもらえると助かります。"],
    };
  }
  return { verdict: "ok", perception: "このまま届けて大丈夫そう！", alternatives: [] };
}

/**
 * API キーがなくても流れを確かめるための台本。Claude の応答ではない。
 * 審査員がキーなしで触るときと、テストで使う。
 */
export function createScriptedClaude(): ClaudeClient {
  return {
    mode: "scripted",
    async complete({ task, messages, jsonSchema }) {
      if (task === "draft") return { text: JSON.stringify(scriptedDraft(messages[0].content, jsonSchema)), refused: false };
      if (task === "reply") return { text: JSON.stringify(scriptedReply(messages[0].content)), refused: false };
      if (task === "connect") return { text: JSON.stringify(scriptedConnect(messages[0].content, jsonSchema)), refused: false };
      if (task === "safety") return { text: JSON.stringify(scriptedSafety(messages[0].content)), refused: false };
      if (task === "review") return { text: JSON.stringify(scriptedReview(messages[0].content)), refused: false };

      const last = messages.at(-1)?.content.trim() ?? "";
      const text = (replies as Record<string, string>)[last] ?? fallbackReply;
      return { text, refused: false };
    },
  };
}
