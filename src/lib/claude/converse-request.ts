import { converse } from "./converse";
import type { ChatMessage, ClaudeClient } from "./types";

export const MAX_TEXT_LENGTH = 2000;
export const MAX_HISTORY = 40;

export type ConverseOutcome =
  | { status: 200; body: { reply: string; mode: ClaudeClient["mode"] } }
  | { status: 400 | 503; body: { error: string } };

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length <= MAX_TEXT_LENGTH * 2
  );
}

/** 画面からの依頼を確かめて、相棒の返事を返す。話の中身はログに残さない。 */
export async function handleConverse(claude: ClaudeClient, input: unknown): Promise<ConverseOutcome> {
  const { history, text } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_TEXT_LENGTH) {
    return { status: 400, body: { error: "言葉が空か、長すぎます" } };
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY || !history.every(isMessage)) {
    return { status: 400, body: { error: "会話の記録が正しくありません" } };
  }

  try {
    const { reply } = await converse(claude, history, text.trim());
    return { status: 200, body: { reply, mode: claude.mode } };
  } catch (error) {
    console.error("相棒の呼び出しに失敗", error instanceof Error ? error.name : "unknown");
    return { status: 503, body: { error: "相棒につながりませんでした" } };
  }
}
