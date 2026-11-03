import { openingLines } from "./persona";
import type { ClaudeClient } from "./types";

const fallbackReply = "なるほど、聞かせてくれてありがとう。もう少し詳しく教えてもらえますか？";

const replies: Record<(typeof openingLines)[number], string> = {
  こんにちは: "こんにちは！今日はどんな一日でしたか？",
  あんた何ができるん: "話聞くんと、もやもやを言葉にするんが得意やで。今なんかある？",
  私は嫌やわ: "そっか、嫌かあ。無理に使わんでええよ。どのへんが嫌やった？",
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
