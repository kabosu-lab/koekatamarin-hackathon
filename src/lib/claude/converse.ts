import { assessWithoutClaude } from "../safety";
import type { DeliverLevel } from "../send-sound";
import { collectsFeedback, isTrialMode } from "../trial";
import { talkFeedbackToDeliver } from "../feedback-consent";
import { companionSystemPrompt, refusalReply, trialCompanionSystemPrompt, trialFeedbackRules } from "./persona";
import { isTeacherSpeaking } from "./scripted";
import type { ChatMessage, ClaudeClient } from "./types";

const MAX_REPLY_TOKENS = 4000;

export type ConverseResult = {
  reply: string;
  refused: boolean;
  /** 投稿にできる要素がそろったとパートナーが判断した（level が 1 以上） */
  ready: boolean;
  /** とどけるの光の段。0＝光らない、1＝何があったか、2＝どうしたか・どうなったか、3＝誰の役に立つかまで */
  level: ReadyLevel;
  /**
   * パートナーがアプリへの感想を「作っている人に届けてもいい？」と聞いた（`[[感想]]` の印）。
   * 試用版で感想を集めているときだけ付く（聞いていないときは付けない）。保存は、本人が次にいいと言ったときに画面がする
   */
  feedback?: true;
  /**
   * 本人が届けることに同意した、感想の本人の言葉（0-3l (2)）。試用版で感想を集めているときだけ付く。
   * 呼び出し側（talk-request.ts）がその場で trial_feedback に残す。画面には返さない
   */
  deliver?: string;
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

/** アプリへの感想を届けてよいか聞いた印。画面には出さない */
const FEEDBACK_MARKS = /\n?\[\[感想\]\]/g;

/** 本人が届けることに同意した印 */
const DELIVERED_MARKS = /\n?\[\[感想を届け(?:る|た)\]\]/g;

/** 返事から感想の印を取り除き、聞いた印（feedback）と同意の印（delivered）があったかを返す */
export function splitFeedback(text: string): { text: string; feedback: boolean; delivered: boolean } {
  const feedback = /\[\[感想\]\]/.test(text);
  const delivered = /\[\[感想を届け(?:る|た)\]\]/.test(text);
  return { text: text.replace(FEEDBACK_MARKS, "").replace(DELIVERED_MARKS, ""), feedback, delivered };
}

/** 届けたあとの返事が「届けた」と言い切っていなければ、頭に言い切りを足す（「画面から」などと言わせない） */
export function sayDelivered(reply: string, teacher: boolean): string {
  if (/届け(まし)?た|とどけた/.test(reply)) return reply;
  return `${teacher ? "届けました。ありがとうございます。" : "届けたよ、ありがとう！"}${reply ? `\n${reply}` : ""}`;
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
  const asksFeedback = collectsFeedback();
  const prompt = isTrialMode()
    ? asksFeedback
      ? `${trialCompanionSystemPrompt}\n\n${trialFeedbackRules}`
      : trialCompanionSystemPrompt
    : companionSystemPrompt;
  const { text, refused } = await claude.complete({
    task: "converse",
    system: memory ? `${prompt}\n\n${memory}` : prompt,
    messages: [...history, { role: "user", content: userText }],
    maxTokens: MAX_REPLY_TOKENS,
  });

  // 感想の印は、試用でないときも画面に出さない
  const marked = splitFeedback(text);
  const { reply, level } = splitReady(marked.text);
  if (refused || reply === "") {
    return { reply: refusalReply, refused, ready: false, level: 0 };
  }
  // 命や安全に関わるはっきりした言葉があれば、パートナーが印を付けても光らせず、感想も預からない
  if (assessWithoutClaude(userText).concern) return { reply, refused: false, ready: false, level: 0 };
  // 本人が届けることに同意したら、本人の言葉を預ける（同意の判定は印と、聞いたあとの返事の両方で見る）
  const deliver = asksFeedback ? talkFeedbackToDeliver(history, userText, marked.delivered) : null;
  return {
    reply: deliver ? sayDelivered(reply, isTeacherSpeaking(memory)) : reply,
    refused: false,
    ready: level > 0,
    level,
    // 届けた返事では、もう一度聞いた印を立てない（同じ感想を二重に預けない）
    ...(asksFeedback && marked.feedback && !deliver ? { feedback: true as const } : {}),
    ...(deliver ? { deliver } : {}),
  };
}
