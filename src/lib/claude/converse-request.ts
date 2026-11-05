import { converse } from "./converse";
import type { ChatMessage, ClaudeClient } from "./types";

export const MAX_TEXT_LENGTH = 2000;
export const MAX_HISTORY = 40;

export type ConverseOutcome =
  | { status: 200; body: { reply: string; mode: ClaudeClient["mode"]; ready: boolean } }
  | { status: 400 | 503; body: { error: string } };

export function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.length <= MAX_TEXT_LENGTH * 2
  );
}

/** 依頼の形を確かめる。正しくなければ null。 */
export function parseConverseInput(input: unknown): { history: ChatMessage[]; text: string } | null {
  const { history, text } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_TEXT_LENGTH) return null;
  if (!Array.isArray(history) || history.length > MAX_HISTORY || !history.every(isMessage)) return null;
  return { history, text: text.trim() };
}

/** 画面からの依頼を確かめて、パートナーの返事を返す。話の中身はログに残さない。 */
export async function handleConverse(
  claude: ClaudeClient,
  input: unknown,
  memory: string = "",
): Promise<ConverseOutcome> {
  const parsed = parseConverseInput(input);
  if (!parsed) return { status: 400, body: { error: "言葉か会話の記録が正しくありません" } };

  try {
    const { reply, ready } = await converse(claude, parsed.history, parsed.text, memory);
    return { status: 200, body: { reply, mode: claude.mode, ready } };
  } catch (error) {
    console.error("パートナーの呼び出しに失敗", error instanceof Error ? error.name : "unknown");
    return { status: 503, body: { error: "パートナーにつながりませんでした" } };
  }
}
