import { openingLines } from "./persona";
import type { ClaudeClient } from "./types";

const fallbackReply = "なるほど、聞かせてくれてありがとう。もう少し詳しく教えてもらえますか？";

const replies: Record<(typeof openingLines)[number], string> = {
  こんにちは: "こんにちは！今日はどんな一日でしたか？",
  あんた何ができるん: "話してくれたことを一緒に言葉にできますよ。最近ちょっと気になっていることはありますか？",
  私は嫌やわ: "そっか、無理に使わなくて大丈夫ですよ。もしよければ、どんなところが嫌か聞いてもいいですか？",
};

/**
 * API キーがなくても流れを確かめるための台本。Claude の応答ではない。
 * 審査員がキーなしで触るときと、テストで使う。
 */
export function createScriptedClaude(): ClaudeClient {
  return {
    mode: "scripted",
    async complete({ messages }) {
      const last = messages.at(-1)?.content.trim() ?? "";
      const text = (replies as Record<string, string>)[last] ?? fallbackReply;
      return { text, refused: false };
    },
  };
}
