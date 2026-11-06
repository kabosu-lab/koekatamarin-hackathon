import { assessWithoutClaude } from "../safety";
import type { DeliverLevel } from "../send-sound";
import { isTrialMode } from "../trial";
import { companionSystemPrompt, refusalReply, trialCompanionSystemPrompt } from "./persona";
import type { ChatMessage, ClaudeClient } from "./types";

const MAX_REPLY_TOKENS = 4000;

export type ConverseResult = {
  reply: string;
  refused: boolean;
  /** 投稿にできる要素がそろったとパートナーが判断した（level が 1 以上） */
  ready: boolean;
  /** とどけるの光の段。0＝光らない、1＝何があったか、2＝どうしたか・どうなったか、3＝誰の役に立つかまで */
  level: ReadyLevel;
};

/** 段の型は、画面の音と光（send-sound.ts）と同じものを使う */
export type ReadyLevel = DeliverLevel;

/** `[[とどけられる]]`（前の形、段1として読む）と `[[とどけられる:1]]`〜`[[とどけられる:3]]` */
const READY_MARKS = /\[\[とどけられる(?:[:：]\s*(\d))?\]\]/g;

/**
 * 返事から印を取り除き、段を返す。印は返事のどこにあっても画面に出さない。
 * 印が2つあれば高いほう。段の範囲外の数字は 1〜3 に収める。段を下げない決まりは画面の側で守る。
 */
export function splitReady(text: string): { reply: string; ready: boolean; level: ReadyLevel } {
  let level = 0;
  for (const match of text.matchAll(READY_MARKS)) {
    const value = match[1] === undefined ? 1 : Math.min(3, Math.max(1, Number(match[1])));
    level = Math.max(level, value);
  }
  return { reply: withSources(text.replace(READY_MARKS, "")).trim(), ready: level > 0, level: level as ReadyLevel };
}

/** 調べもの（0-1s）の出典の印 [[出典:題|URL]] を、印のまま見せず「出典：題 URL」の行にする */
const SOURCE_MARKS = /\n?\[\[出典:([^|\]]*)\|([^\]]*)\]\]/g;
export function withSources(text: string): string {
  const sources: string[] = [];
  const body = text.replace(SOURCE_MARKS, (_all, title: string, url: string) => {
    if (/^https?:\/\//.test(url.trim())) sources.push(`出典：${title.trim()} ${url.trim()}`);
    return "";
  });
  return sources.length > 0 ? `${body.trim()}\n\n${sources.join("\n")}` : body;
}

/** パートナーとの会話を1往復進める。履歴は呼び出し側が持つ。 */
export async function converse(
  claude: ClaudeClient,
  history: ChatMessage[],
  userText: string,
  memory: string = "",
): Promise<ConverseResult> {
  const prompt = isTrialMode() ? trialCompanionSystemPrompt : companionSystemPrompt;
  const { text, refused } = await claude.complete({
    task: "converse",
    system: memory ? `${prompt}\n\n${memory}` : prompt,
    messages: [...history, { role: "user", content: userText }],
    maxTokens: MAX_REPLY_TOKENS,
  });

  const { reply, level } = splitReady(text);
  if (refused || reply === "") {
    return { reply: refusalReply, refused, ready: false, level: 0 };
  }
  // 命や安全に関わるはっきりした言葉があれば、パートナーが印を付けても光らせない
  if (assessWithoutClaude(userText).concern) return { reply, refused: false, ready: false, level: 0 };
  return { reply, refused: false, ready: level > 0, level };
}
