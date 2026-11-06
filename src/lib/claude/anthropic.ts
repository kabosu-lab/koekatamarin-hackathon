import Anthropic from "@anthropic-ai/sdk";
import { TooLongError } from "./compose";
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
  /** 調べた時刻（1回の検索ごとに1つ）。サーバーの中だけに置き、誰が調べたかは持たない */
  log: number[];
};

const webSearchLog: number[] = [];

/**
 * 環境から調べものの設定を決める。KOEKATA_WEB_SEARCH=off で止められる。
 * 上限は、試用版と審査員用（合言葉があるとき）だけ。KOEKATA_WEB_SEARCH_PER_HOUR で変えられる
 */
export function webSearchOptionsFromEnv(env: Record<string, string | undefined> = process.env): WebSearchOptions {
  const trial = Boolean(env.KOEKATA_ACCESS_CODE?.trim());
  return {
    enabled: env.KOEKATA_WEB_SEARCH !== "off",
    perHour: Number(env.KOEKATA_WEB_SEARCH_PER_HOUR) || (trial ? DEFAULT_WEB_SEARCHES_PER_HOUR : Infinity),
    now: Date.now,
    log: webSearchLog,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/** この1時間に調べた回数に、まだ空きがあるか。数えるのは実際に調べたあと（recordSearches） */
function hasSearchRoom(options: WebSearchOptions): boolean {
  const { log } = options;
  const now = options.now();
  while (log.length > 0 && log[0] <= now - HOUR_MS) log.shift();
  return log.length < options.perHour;
}

/** 実際に調べた回数だけ記録する */
function recordSearches(options: WebSearchOptions, count: number): void {
  const now = options.now();
  for (let i = 0; i < count; i++) options.log.push(now);
}

/** パートナーとの会話だけに、調べものの道具を渡す。JSON で返させる呼び出しや、上限を超えたときは渡さない */
function webSearchTools(request: ClaudeRequest, options: WebSearchOptions): Anthropic.Beta.BetaToolUnion[] | undefined {
  if (!options.enabled || request.task !== "converse" || request.jsonSchema) return undefined;
  if (!hasSearchRoom(options)) return undefined;
  // 新しい web_search_20260209 は中で絞り込みのコードを動かすため遅く、返事に出典（citations）が付かない。
  // 声の会話で待たせず、出典を必ず返したいので、基本の版を使う
  return [
    {
      type: "web_search_20250305",
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

/** 引用がないときに、検索結果の上から出典として出す数 */
const FALLBACK_SOURCES = 2;

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
  // 調べたのに引用が付かなかったときは、最後の検索の上位を出典として示す（本人が確かめられるように）
  if (sources.size === 0) {
    const results = content.filter((block) => block.type === "web_search_tool_result").at(-1);
    if (results && Array.isArray(results.content)) {
      for (const result of results.content.slice(0, FALLBACK_SOURCES)) sources.set(result.url, result.title || result.url);
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
        recordSearches(webSearch, response.usage?.server_tool_use?.web_search_requests ?? 0);
        if (response.stop_reason === "refusal") return { text: "", refused: true };
        // 調べものが長くて途中で止まったら、続きをさせる（言葉は足さず、そのまま送り返す）
        if (response.stop_reason !== "pause_turn" || attempt >= MAX_RESUMES) break;
      }

      return { text: textWithSources(content), refused: false };
    },
    // 0-2l：下書きの本文を流しながら見せるための呼び出し。調べものの道具は渡さない（JSON で返させる呼び出しだけで使う）
    async stream(request, onText, signal) {
      const { system, messages, maxTokens, jsonSchema, attachment } = request;
      const events = await api.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: withAttachment(messages, attachment),
        stream: true,
        output_config: {
          effort: "medium",
          ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}),
        },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      }, signal ? { signal } : undefined);
      let text = "";
      let truncated = false;
      let refused = false;
      for await (const event of events) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          text += event.delta.text;
          onText(event.delta.text);
        } else if (event.type === "message_delta" && event.delta.stop_reason === "refusal") {
          refused = true;
        } else if (event.type === "message_delta" && event.delta.stop_reason === "max_tokens") {
          truncated = true;
        }
      }
      if (refused) return { text: "", refused: true };
      // 書き切れなかった下書きは、壊れた JSON として扱わず、長すぎたと分けて知らせる
      if (truncated) throw new TooLongError("下書きが長すぎて、書き切れませんでした");
      return { text, refused: false };
    },
  };
}
