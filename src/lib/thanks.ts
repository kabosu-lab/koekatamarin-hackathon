import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { reviewPost } from "./claude/compose";
import type { ClaudeClient } from "./claude/types";
import { MAX_BODY_LENGTH } from "./destination/types";
import { readThanksKind, type ThanksKind } from "./thanks-kind";
import { cleanTitle, offerTitle } from "./titles";

/** kind は保存せず、言葉から毎回読み取る（ありがとう・がんばったね・おめでとう） */
export type ThanksCard = { id: string; fromName: string; message: string; createdAt: string; kind: ThanksKind };

export function listThanks(db: DatabaseSync, personId: string): ThanksCard[] {
  const rows = db
    .prepare(
      `SELECT t.id, p.name AS from_name, t.message, t.created_at FROM thanks t
       JOIN people p ON p.id = t.from_person_id
       WHERE t.to_person_id = ? ORDER BY t.created_at DESC, t.rowid DESC`,
    )
    .all(personId) as { id: string; from_name: string; message: string; created_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    fromName: row.from_name,
    message: row.message,
    createdAt: row.created_at,
    kind: readThanksKind(row.message),
  }));
}

/** ありがとうを送る。受け取る人だけに見える。投稿と同じく、確かめられないときは送らない。 */
export async function handleSendThanks(
  claude: ClaudeClient,
  db: DatabaseSync,
  fromId: string,
  input: unknown,
  now: Date = new Date(),
) {
  const { toPersonId, message, title } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (typeof toPersonId !== "string" || toPersonId === fromId) {
    return { status: 400, body: { error: "送る相手が正しくありません" } };
  }
  if (typeof message !== "string" || message.trim() === "" || message.length > MAX_BODY_LENGTH) {
    return { status: 400, body: { error: "言葉が空か、長すぎます" } };
  }
  if (!db.prepare("SELECT 1 FROM people WHERE id = ?").get(toPersonId)) {
    return { status: 400, body: { error: "送る相手が正しくありません" } };
  }
  const giving = title === undefined || title === null ? null : cleanTitle(title);
  if (title !== undefined && title !== null && giving === null) {
    return { status: 400, body: { error: "肩書きが空か、長すぎます" } };
  }

  try {
    const review = await reviewPost(claude, giving ? `${message}\n肩書き：${giving}` : message);
    if (review.verdict === "block") return { status: 422, body: { error: review.perception } };
  } catch (error) {
    console.error("ありがとうの確認に失敗", error instanceof Error ? error.name : "unknown");
    return { status: 503, body: { error: "確認ができなかったので、まだ送っていません" } };
  }

  const id = randomUUID();
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    fromId,
    toPersonId,
    message.trim(),
    now.toISOString(),
  );
  if (giving) offerTitle(db, fromId, toPersonId, giving, now);
  return { status: 200, body: { id } };
}
