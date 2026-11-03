import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClaude } from "./anthropic";
import { createScriptedClaude } from "./scripted";
import type { ClaudeClient } from "./types";

/**
 * 環境に合う Claude を選ぶ。キーがなければ台本で動く。
 * KOEKATA_CLAUDE=scripted なら、キーがあっても台本を使う（テストで料金を使わないため）。
 */
export function createClaude(env: Record<string, string | undefined> = process.env): ClaudeClient {
  if (env.KOEKATA_CLAUDE === "scripted" || !env.ANTHROPIC_API_KEY) {
    return createScriptedClaude();
  }
  return createAnthropicClaude(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).beta.messages);
}
