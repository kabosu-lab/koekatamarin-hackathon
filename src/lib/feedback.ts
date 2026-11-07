import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const FEEDBACK_KINDS = ["分かりにくい", "動かない", "こうしたい", "よかった"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
/** 種類を選ばずに送ったもの */
export const FEEDBACK_UNSORTED = "感想";
/** 話す画面で、パートナーが聞いて本人がいいと言ったもの */
export const FEEDBACK_FROM_TALK = "話の中で";
/** 保存する種類。選べるもの＋選ばなかったもの＋話の中で預かったもの */
export type StoredFeedbackKind = FeedbackKind | typeof FEEDBACK_UNSORTED | typeof FEEDBACK_FROM_TALK;
const STORED_KINDS: readonly StoredFeedbackKind[] = [...FEEDBACK_KINDS, FEEDBACK_UNSORTED, FEEDBACK_FROM_TALK];
export const MAX_FEEDBACK_LENGTH = 1000;

const MAX_PATH_LENGTH = 200;
const MAX_SCREEN_WIDTH = 20_000;
const LIMIT_WINDOW_MS = 60_000;
const LIMIT_PER_DEVICE = 10;
/** 端末の印がまだない人をまとめて数える。みんなの最初の1件を止めないよう、広めにする */
const LIMIT_WITHOUT_DEVICE = 60;

export type FeedbackInput = { kind: StoredFeedbackKind; body: string; path: string; screenWidth: number | null };

/**
 * 送られた値を確かめる。道は問い合わせの部分を落とし、読めない値は「不明」にする。
 * 種類は選ばなくてよい（そのときは本文が要る）。from が "talk" なら、話す画面で預かった本文。
 */
export function parseFeedback(input: unknown): FeedbackInput | null {
  if (typeof input !== "object" || input === null) return null;
  const { kind, body, path, screenWidth, from } = input as Record<string, unknown>;
  const chosen = kind === undefined || kind === null || kind === "" ? null : FEEDBACK_KINDS.find((k) => k === kind);
  if (chosen === undefined) return null;
  const text = typeof body === "string" ? body.trim() : body === undefined ? "" : null;
  if (text === null || text.length > MAX_FEEDBACK_LENGTH) return null;
  // 種類も本文もなければ、送るものがない
  if (!chosen && !text) return null;
  const known: StoredFeedbackKind = from === "talk" && text ? FEEDBACK_FROM_TALK : (chosen ?? FEEDBACK_UNSORTED);
  const pathname = typeof path === "string" && path.startsWith("/") ? path.split(/[?#]/)[0].slice(0, MAX_PATH_LENGTH) : "不明";
  const width =
    typeof screenWidth === "number" && Number.isInteger(screenWidth) && screenWidth > 0 && screenWidth <= MAX_SCREEN_WIDTH
      ? screenWidth
      : null;
  return { kind: known, body: text, path: pathname, screenWidth: width };
}

/** 誰が送ったかは受け取らない。 */
export function saveFeedback(db: DatabaseSync, input: FeedbackInput, now: Date): void {
  db.prepare("INSERT INTO trial_feedback (id, kind, body, path, screen_width, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    input.kind,
    input.body,
    input.path,
    input.screenWidth,
    now.toISOString(),
  );
}

/**
 * 話の中で本人が届けることに同意した感想を残す（0-3l (2)）。サーバーの中で、返事と同じ呼び出しの間に保存する。
 * 同じ言葉がもう話の中の感想として残っていれば、二重に残さない。残したら true。
 */
export function saveTalkFeedback(db: DatabaseSync, place: { body: string; path?: unknown; screenWidth?: unknown }, now: Date): boolean {
  const parsed = parseFeedback({ body: place.body.slice(0, MAX_FEEDBACK_LENGTH), path: place.path, screenWidth: place.screenWidth, from: "talk" });
  if (!parsed || parsed.kind !== FEEDBACK_FROM_TALK) return false;
  const seen = db.prepare("SELECT 1 FROM trial_feedback WHERE kind = ? AND body = ? LIMIT 1").get(FEEDBACK_FROM_TALK, parsed.body);
  if (seen) return false;
  saveFeedback(db, parsed, now);
  return true;
}

/** 連打を抑える。数えるのはメモリの中だけで、保存しない。再起動で忘れてよい。 */
export function createFeedbackLimiter() {
  const counts = new Map<string, { startedAt: number; count: number }>();
  return (device: string | null, now: number): boolean => {
    for (const [key, entry] of counts) {
      if (now - entry.startedAt >= LIMIT_WINDOW_MS) counts.delete(key);
    }
    const key = device ?? "";
    const entry = counts.get(key) ?? { startedAt: now, count: 0 };
    if (entry.count >= (device ? LIMIT_PER_DEVICE : LIMIT_WITHOUT_DEVICE)) return false;
    entry.count += 1;
    counts.set(key, entry);
    return true;
  };
}

/** 本文を Markdown の引用に収める。HTML として動かず、見出しや一覧にも化けないようにする。 */
export function escapeFeedbackText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]()#|!~])/g, "\\$1")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

type FeedbackRow = { kind: string; body: string; path: string; screen_width: number | null; created_at: string };

const JST = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function feedbackToMarkdown(db: DatabaseSync): string {
  const rows = db
    .prepare("SELECT kind, body, path, screen_width, created_at FROM trial_feedback ORDER BY created_at, rowid")
    .all() as FeedbackRow[];
  const lines = ["# 生徒からの改善点", "", `全 ${rows.length} 件`];
  for (const kind of STORED_KINDS) lines.push(`- ${kind}：${rows.filter((r) => r.kind === kind).length} 件`);
  for (const row of rows) {
    const width = row.screen_width === null ? "幅 不明" : `幅 ${row.screen_width}`;
    lines.push("", `## ${row.kind}｜${JST.format(new Date(row.created_at))}｜${escapeFeedbackText(row.path).slice(2)}｜${width}`);
    if (row.body) lines.push("", escapeFeedbackText(row.body));
  }
  return `${lines.join("\n")}\n`;
}
