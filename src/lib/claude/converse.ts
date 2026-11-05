import { isTrialMode } from "../trial";
import { companionSystemPrompt, READY_MARK, refusalReply, trialCompanionSystemPrompt } from "./persona";
import type { ChatMessage, ClaudeClient } from "./types";

const MAX_REPLY_TOKENS = 4000;

export type ConverseResult = {
  reply: string;
  refused: boolean;
  /** 投稿にできる要素がそろったとパートナーが判断した */
  ready: boolean;
};

/** 返事から印を取り除き、印があったかを返す。印は返事のどこにあっても画面に出さない */
export function splitReady(text: string): { reply: string; ready: boolean } {
  const ready = text.includes(READY_MARK);
  return { reply: text.split(READY_MARK).join("").trim(), ready };
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

  const { reply, ready } = splitReady(text);
  if (refused || reply === "") {
    return { reply: refusalReply, refused, ready: false };
  }
  return { reply, refused: false, ready };
}
