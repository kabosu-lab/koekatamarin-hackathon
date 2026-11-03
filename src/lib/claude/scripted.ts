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

function scriptedLookback(prompt: string) {
  const lines = prompt.split("\n").filter((line) => /^(日報|投稿|返信|ありがとう)：/.test(line));
  if (lines.length === 0) return { ready: false, text: "" };
  return { ready: true, text: `この期間に、${lines.length} 個のやり取りがありました。${lines[0].replace(/^.*?：/, "")}` };
}

function scriptedDaily(prompt: string) {
  const lines = [...prompt.matchAll(/^(?:本人：|投稿：|返信：|ありがとう：|勉強：)(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => !(openingLines as readonly string[]).includes(line));
  return { items: lines.slice(-6) };
}

function scriptedProfile(prompt: string) {
  const asked = prompt.match(/<頼み>([\s\S]*?)<\/頼み>/)?.[1]?.trim();
  if (asked) return { ready: true, text: `言葉で頼んで直したプロフィール（${asked}）` };
  const word = prompt.match(/<言葉>([\s\S]*?)<\/言葉>/)?.[1]?.trim();
  return word ? { ready: true, text: `校内で話していること：${word.slice(0, 40)}` } : { ready: false, text: "" };
}

function scriptedCheer(jsonSchema: Record<string, unknown> | undefined) {
  const properties = (jsonSchema?.properties ?? {}) as {
    hints?: { items?: { properties?: { postId?: { enum?: string[] } } } };
  };
  const ids = properties.hints?.items?.properties?.postId?.enum ?? [];
  return { hints: ids.map((postId) => ({ postId, hint: "続けて頑張っているみたい！一言どうですか？" })) };
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

function scriptedNakama(jsonSchema: Record<string, unknown> | undefined) {
  const properties = (jsonSchema?.properties ?? {}) as {
    suggestions?: { items?: { properties?: { personId?: { enum?: string[] } } } };
  };
  const ids = properties.suggestions?.items?.properties?.personId?.enum ?? [];
  return { suggestions: ids.slice(0, 2).map((personId) => ({ personId, reason: "公開の投稿に、近い話題があります。" })) };
}

function scriptedKnowledgeDraft(prompt: string) {
  const post = prompt.match(/^投稿：[^：]*：(.*)$/m)?.[1]?.trim() ?? "";
  const answers = [...prompt.matchAll(/^返事：(.*)$/gm)].map((match) => match[1].trim());
  if (!post || answers.length === 0) return { ready: false, title: "", body: "" };
  return { ready: true, title: post.slice(0, 24), body: answers.join("\n") };
}

/** 漢字とカタカナの2文字が重なる材料を、近いものとして選ぶ。 */
function scriptedKnowledgeFind(prompt: string) {
  const asked = prompt.match(/<本人の話>([\s\S]*?)<\/本人の話>/)?.[1] ?? "";
  const pairs = new Set(
    [...asked.matchAll(/[\p{Script=Han}\p{Script=Katakana}]{2,}/gu)].flatMap(([word]) =>
      Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)),
    ),
  );
  const material = prompt.slice(prompt.indexOf("<材料>"));
  const results = [...material.matchAll(/^- ([kp]-[^：]+)：(.*)$/gm)]
    .filter(([, , text]) => [...pairs].some((pair) => text.includes(pair)))
    .slice(0, 2)
    .map(([, id]) => ({ id, reason: "話していることに近い言葉が出てきます。" }));
  return { results };
}

function scriptedSafety(conversation: string) {
  if (/死にたい|消えたい|自殺/.test(conversation)) return { category: "self_harm" };
  if (/殴られ|虐待|グループから外されて|いじめられ/.test(conversation)) return { category: "violence_or_abuse" };
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
      if (task === "lookback") return { text: JSON.stringify(scriptedLookback(messages[0].content)), refused: false };
      if (task === "daily") return { text: JSON.stringify(scriptedDaily(messages[0].content)), refused: false };
      if (task === "profile") return { text: JSON.stringify(scriptedProfile(messages[0].content)), refused: false };
      if (task === "cheer") return { text: JSON.stringify(scriptedCheer(jsonSchema)), refused: false };
      if (task === "reply") return { text: JSON.stringify(scriptedReply(messages[0].content)), refused: false };
      if (task === "connect") return { text: JSON.stringify(scriptedConnect(messages[0].content, jsonSchema)), refused: false };
      if (task === "nakama") return { text: JSON.stringify(scriptedNakama(jsonSchema)), refused: false };
      if (task === "knowledge_draft") return { text: JSON.stringify(scriptedKnowledgeDraft(messages[0].content)), refused: false };
      if (task === "knowledge_find") return { text: JSON.stringify(scriptedKnowledgeFind(messages[0].content)), refused: false };
      if (task === "safety") return { text: JSON.stringify(scriptedSafety(messages[0].content)), refused: false };
      if (task === "review") return { text: JSON.stringify(scriptedReview(messages[0].content)), refused: false };

      const last = messages.at(-1)?.content.trim() ?? "";
      const text = (replies as Record<string, string>)[last] ?? fallbackReply;
      return { text, refused: false };
    },
  };
}
