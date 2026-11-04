import { isTrialMode } from "../trial";
import { companionSystemPrompt, refusalReply, trialCompanionSystemPrompt } from "./persona";
import type { ChatMessage, ClaudeClient } from "./types";

const MAX_REPLY_TOKENS = 4000;

export type ConverseResult = {
  reply: string;
  refused: boolean;
};

/** 相棒との会話を1往復進める。履歴は呼び出し側が持つ。 */
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

  if (refused || text.trim() === "") {
    return { reply: refusalReply, refused };
  }
  return { reply: text, refused: false };
}
