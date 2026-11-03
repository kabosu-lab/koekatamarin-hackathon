import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "./types";

export const MODEL = "claude-opus-5-5";

/** SDK のうち、この部品が使う部分だけ。テストではここを差し替える。 */
export type MessagesApi = Pick<Anthropic.Beta.Messages, "create">;

export function createAnthropicClaude(api: MessagesApi): ClaudeClient {
  return {
    mode: "real",
    async complete({ system, messages, maxTokens, jsonSchema }) {
      const response = await api.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages,
        output_config: {
          effort: "medium",
          ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}),
        },
        // 安全の判定で断られたとき、同じ呼び出しの中で別のモデルが引き継ぐ
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      return { text, refused: response.stop_reason === "refusal" };
    },
  };
}
