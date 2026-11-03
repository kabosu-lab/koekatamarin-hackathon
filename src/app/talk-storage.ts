import type { ChatMessage } from "@/lib/claude/types";

function key(viewerName: string): string {
  return `koekata-talk-${viewerName}`;
}

/** 相棒との話は、このブラウザのタブの中だけに置く。タブを閉じると消える。 */
export function saveTalk(viewerName: string, messages: ChatMessage[]): void {
  try {
    sessionStorage.setItem(key(viewerName), JSON.stringify(messages));
  } catch {
    // 残せなくても、会話は続けられる
  }
}

export function loadTalk(viewerName: string): ChatMessage[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key(viewerName)) ?? "[]");
    return Array.isArray(value) ? (value as ChatMessage[]) : [];
  } catch {
    return [];
  }
}
