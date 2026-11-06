import Anthropic from "@anthropic-ai/sdk";
import { takeCall } from "./limit";
import { sourceMark } from "./persona";
import type { ChatMessage, ClaudeAttachment, ClaudeClient, ClaudeRequest } from "./types";

export const MODEL = "claude-opus-5-5";

/** SDK のうち、この部品が使う部分だけ。テストではここを差し替える。 */
export type MessagesApi = Pick<Anthropic.Beta.Messages, "create">;

/** 1回の返事で調べてよい回数。声の会話なので、待たせすぎない */
export const WEB_SEARCH_MAX_USES = 2;
/** 調べものの1時間あたりの上限（KOEKATA_WEB_SEARCH_PER_HOUR で変えられる）。超えたら道具を渡さず、ふつうに話す */
export const DEFAULT_WEB_SEARCHES_PER_HOUR = 30;
/** 長い調べものが途中で止まったとき、続けさせる回数 */
const MAX_RESUMES = 2;

export type WebSearchOptions = {
  /** false なら調べものの道具を渡さない */
  enabled: boolean;
  perHour: number;
  now: () => number;
  /** 調べものの返事を作った時刻。サーバーの中だけに置き、誰が調べたかは持たない */
  log: number[];
};

const webSearchLog: number[] = [];

/** 環境から調べものの設定を決める。KOEKATA_WEB_SEARCH=off で止められる */
export function webSearchOptionsFromEnv(env: Record<string, string | undefined> = process.env): WebSearchOptions {
  return {
    enabled: env.KOEKATA_WEB_SEARCH !== "off",
    perHour: Number(env.KOEKATA_WEB_SEARCH_PER_HOUR) || DEFAULT_WEB_SEARCHES_PER_HOUR,
    now: Date.now,
    log: webSearchLog,
  };
}

/** パートナーとの会話だけに、調べものの道具を渡す。JSON で返させる呼び出しや、上限を超えたときは渡さない */
function webSearchTools(request: ClaudeRequest, options: WebSearchOptions): Anthropic.Beta.BetaToolUnion[] | undefined {
  if (!options.enabled || request.task !== "converse" || request.jsonSchema) return undefined;
  // 上限は、道具を渡す回数で数える（実際に調べたかどうかは返事が来るまで分からないため、多めに数える）
  if (!takeCall(options.now(), options.perHour, options.log)) return undefined;
  return [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: WEB_SEARCH_MAX_USES,
      user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" },
    },
  ];
}

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

/** 返事の文章と、調べものの出典。出典は同じ URL を1つにまとめ、返事の最後に印として付ける */
export function textWithSources(content: Anthropic.Beta.BetaContentBlock[]): string {
  const text = content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const sources = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "text") continue;
    for (const citation of block.citations ?? []) {
      if (citation.type === "web_search_result_location" && !sources.has(citation.url)) {
        sources.set(citation.url, citation.title ?? citation.url);
      }
    }
  }
  if (sources.size === 0) return text;
  const marks = [...sources].map(([url, title]) => sourceMark(title, url)).join("\n");
  return `${text.trim()}\n${marks}`;
}

export function createAnthropicClaude(api: MessagesApi, webSearch: WebSearchOptions = webSearchOptionsFromEnv()): ClaudeClient {
  return {
    mode: "real",
    async complete(request) {
      const { system, messages, maxTokens, jsonSchema, attachment } = request;
      const tools = webSearchTools(request, webSearch);
      const conversation = withAttachment(messages, attachment);
      const content: Anthropic.Beta.BetaContentBlock[] = [];

      for (let attempt = 0; ; attempt++) {
        const response = await api.create({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          messages: content.length > 0 ? [...conversation, { role: "assistant", content: [...content] }] : conversation,
          ...(tools ? { tools } : {}),
          output_config: {
            effort: "medium",
            ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}),
          },
          // 安全の判定で断られたとき、同じ呼び出しの中で別のモデルが引き継ぐ
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        content.push(...response.content);
        if (response.stop_reason === "refusal") return { text: "", refused: true };
        // 調べものが長くて途中で止まったら、続きをさせる（言葉は足さず、そのまま送り返す）
        if (response.stop_reason !== "pause_turn" || attempt >= MAX_RESUMES) break;
      }

      return { text: textWithSources(content), refused: false };
    },
  };
}
