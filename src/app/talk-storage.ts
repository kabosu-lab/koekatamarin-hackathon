import type { ChatMessage } from "@/lib/claude/types";

function key(viewerName: string): string {
  return `koekata-talk-${viewerName}`;
}

/** パートナーとの話は、このブラウザのタブの中だけに置く。タブを閉じると消える。 */
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

function archiveKey(viewerName: string): string {
  return `koekata-talk-archive-${viewerName}`;
}

const MAX_ARCHIVE = 10;

/** 「新しく話す」で畳んだ前の話。これもタブの中だけに置く（新しいものが後ろ） */
export function archiveTalk(viewerName: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  try {
    const past = loadArchive(viewerName);
    sessionStorage.setItem(archiveKey(viewerName), JSON.stringify([...past, messages].slice(-MAX_ARCHIVE)));
  } catch {
    // 残せなくても、新しく話せる
  }
}

export function loadArchive(viewerName: string): ChatMessage[][] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(archiveKey(viewerName)) ?? "[]");
    return Array.isArray(value) ? (value as ChatMessage[][]) : [];
  } catch {
    return [];
  }
}
