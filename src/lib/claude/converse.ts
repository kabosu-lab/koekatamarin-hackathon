import { companionSystemPrompt, refusalReply } from "./persona";
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
): Promise<ConverseResult> {
  const { text, refused } = await claude.complete({
    task: "converse",
    system: companionSystemPrompt,
    messages: [...history, { role: "user", content: userText }],
    maxTokens: MAX_REPLY_TOKENS,
  });

  if (refused || text.trim() === "") {
    return { reply: refusalReply, refused };
  }
  return { reply: text, refused: false };
}
