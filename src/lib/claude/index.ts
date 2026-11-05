import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClaude } from "./anthropic";
import { limitClaude } from "./limit";
import { createScriptedClaude } from "./scripted";
import type { ClaudeClient } from "./types";

/**
 * 環境に合う Claude を選ぶ。キーがなければ台本で動く。
 * KOEKATA_CLAUDE=scripted なら、キーがあっても台本を使う（テストで料金を使わないため）。
 */
export function createClaude(env: Record<string, string | undefined> = process.env): ClaudeClient {
  const trial = Boolean(env.KOEKATA_ACCESS_CODE?.trim());
  // 生徒の試用では、キーがあっても Claude に送らない
  const studentTrial = trial && env.KOEKATA_TRIAL_AUDIENCE !== "teacher";
  if (env.KOEKATA_CLAUDE === "scripted" || !env.ANTHROPIC_API_KEY || studentTrial) {
    return createScriptedClaude();
  }
  const real = createAnthropicClaude(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).beta.messages);
  // 試用で外から開けるときは、回数に上限を付ける。超えたら台本で答える
  return trial ? limitClaude(real, createScriptedClaude(), Number(env.KOEKATA_CLAUDE_PER_HOUR) || undefined) : real;
}
