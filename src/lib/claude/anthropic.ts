import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ClaudeAttachment, ClaudeClient } from "./types";

export const MODEL = "claude-opus-5-5";

/** SDK のうち、この部品が使う部分だけ。テストではここを差し替える。 */
export type MessagesApi = Pick<Anthropic.Beta.Messages, "create">;

/** 添付を最後の発言の前に置く。本文より先に置くと読み取りが安定する。 */
function withAttachment(messages: ChatMessage[], attachment?: ClaudeAttachment): Anthropic.Beta.BetaMessageParam[] {
  if (!attachment) return messages;
  const source = { type: "base64" as const, data: attachment.base64 };
  const block: Anthropic.Beta.BetaContentBlockParam =
    attachment.mediaType === "application/pdf"
      ? { type: "document", source: { ...source, media_type: attachment.mediaType } }
      : { type: "image", source: { ...source, media_type: attachment.mediaType } };
  return messages.map((message, index) =>
    index === messages.length - 1 ? { role: message.role, content: [block, { type: "text", text: message.content }] } : message,
  );
}

export function createAnthropicClaude(api: MessagesApi): ClaudeClient {
  return {
    mode: "real",
    async complete({ system, messages, maxTokens, jsonSchema, attachment }) {
      const response = await api.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: withAttachment(messages, attachment),
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
