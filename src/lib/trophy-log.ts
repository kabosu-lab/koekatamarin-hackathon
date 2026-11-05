import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * トロフィーの判定に使う操作の記録。何を押したかだけを残し、話の中身も投稿の本文も残さない。
 * 言い換えの案だけは、送った文と比べるために、短い間ハッシュで持つ。
 */
export type TrophyLogKind =
  // 短い間だけ持つ。次の投稿と結びつける
  | "undone"
  | "draft-not-ready"
  | "walk-finished"
  | "ask-suggested"
  | "alternative-offered"
  // 残す
  | "repost-after-undo"
  | "asked-back-post"
  | "walk-post"
  | "asked-human"
  | "rephrase-accepted"
  | "goal-resumed"
  | "knowledge-fixed-after-review"
  | "found-own-post"
  | "found-own-answer";

const SHORT_LIVED: readonly TrophyLogKind[] = ["undone", "draft-not-ready", "walk-finished", "ask-suggested", "alternative-offered"];
/** 操作と投稿を結びつける時間 */
const LINK_MS = 60 * 60 * 1000;
/** 「止まっていた」とみなす時間 */
const GOAL_STALLED_MS = 14 * 86_400_000;
/** 「昔」とみなす時間 */
const LONG_AGO_MS = 30 * 86_400_000;

function log(db: DatabaseSync, personId: string, kind: TrophyLogKind, ref: string, now: Date): void {
  db.prepare("INSERT INTO trophy_log (person_id, kind, ref, created_at) VALUES (?, ?, ?, ?)").run(personId, kind, ref, now.toISOString());
}

function logShortLived(db: DatabaseSync, personId: string, kind: TrophyLogKind, ref: string, now: Date): void {
  const marks = SHORT_LIVED.map(() => "?").join(", ");
  db.prepare(`DELETE FROM trophy_log WHERE kind IN (${marks}) AND created_at < ?`).run(...SHORT_LIVED, new Date(now.getTime() - LINK_MS).toISOString());
  log(db, personId, kind, ref, now);
}

function recently(db: DatabaseSync, personId: string, kind: TrophyLogKind, now: Date, ref = ""): boolean {
  return (
    db
      .prepare("SELECT 1 FROM trophy_log WHERE person_id = ? AND kind = ? AND ref = ? AND created_at >= ? AND created_at <= ? LIMIT 1")
      .get(personId, kind, ref, new Date(now.getTime() - LINK_MS).toISOString(), now.toISOString()) !== undefined
  );
}

function consume(db: DatabaseSync, personId: string, kind: TrophyLogKind): void {
  db.prepare("DELETE FROM trophy_log WHERE person_id = ? AND kind = ?").run(personId, kind);
}

export function hasLogged(db: DatabaseSync, personId: string, kind: TrophyLogKind): { at: string } | null {
  const row = db
    .prepare("SELECT created_at FROM trophy_log WHERE person_id = ? AND kind = ? ORDER BY created_at, id LIMIT 1")
    .get(personId, kind) as { created_at: string } | undefined;
  return row ? { at: row.created_at } : null;
}

function digest(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function noteUndone(db: DatabaseSync, personId: string, now: Date): void {
  logShortLived(db, personId, "undone", "", now);
}

/** 投稿にするにはまだ足りず、パートナーが聞き返した。Claude の返事は読まず、下書きの結果だけを見る。 */
export function noteDraftNotReady(db: DatabaseSync, personId: string, now: Date): void {
  logShortLived(db, personId, "draft-not-ready", "", now);
}

export function noteWalkFinished(db: DatabaseSync, personId: string, now: Date): void {
  logShortLived(db, personId, "walk-finished", "", now);
}

/** パートナーが「聞いてみる？」と案内した相手。 */
export function noteAskSuggested(db: DatabaseSync, personId: string, askedIds: readonly string[], now: Date): void {
  for (const askedId of new Set(askedIds)) {
    if (askedId && !recently(db, personId, "ask-suggested", now, askedId)) logShortLived(db, personId, "ask-suggested", askedId, now);
  }
}

export function noteAlternatives(db: DatabaseSync, personId: string, alternatives: readonly string[], now: Date): void {
  for (const alternative of alternatives) logShortLived(db, personId, "alternative-offered", digest(alternative), now);
}

/** 本人が送った瞬間に、直前の操作と結びつける。 */
export function notePublished(db: DatabaseSync, personId: string, sent: { text: string; askedPersonId?: unknown }, now: Date): void {
  if (recently(db, personId, "undone", now)) {
    log(db, personId, "repost-after-undo", "", now);
    consume(db, personId, "undone");
  }
  if (recently(db, personId, "draft-not-ready", now)) {
    log(db, personId, "asked-back-post", "", now);
    consume(db, personId, "draft-not-ready");
  }
  if (recently(db, personId, "walk-finished", now)) {
    log(db, personId, "walk-post", "", now);
    consume(db, personId, "walk-finished");
  }
  if (typeof sent.askedPersonId === "string" && recently(db, personId, "ask-suggested", now, sent.askedPersonId)) {
    log(db, personId, "asked-human", "", now);
    consume(db, personId, "ask-suggested");
  }
  if (recently(db, personId, "alternative-offered", now, digest(sent.text))) log(db, personId, "rephrase-accepted", "", now);
  // 案の控えは、送ったら残さない
  consume(db, personId, "alternative-offered");
}

/** 止まっていた頑張りたいことに触れた。updatedAt は今回の操作の前の値。 */
export function noteGoalTouched(db: DatabaseSync, personId: string, updatedAt: string, now: Date): void {
  if (now.getTime() - Date.parse(updatedAt) >= GOAL_STALLED_MS) log(db, personId, "goal-resumed", "", now);
}

/** 「うまくいかなかった」の意見があるときに、作った人が知恵を直した。 */
export function noteKnowledgeFixed(db: DatabaseSync, personId: string, itemId: string, now: Date): void {
  const reviewed = db.prepare("SELECT 1 FROM knowledge_reviews WHERE item_id = ? AND verdict = 'not_working' AND reviewer_id != ? LIMIT 1").get(itemId, personId);
  if (reviewed) log(db, personId, "knowledge-fixed-after-review", itemId, now);
}

/** 探した結果から、昔の自分の言葉が入った知恵を開いた。自分の言葉でなければ何も残さない。 */
export function noteFoundKnowledge(db: DatabaseSync, personId: string, itemId: string, now: Date): void {
  const item = db
    .prepare(
      `SELECT i.created_at, p.author_id AS post_author,
              EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = ?) AS answered
       FROM knowledge_items i JOIN posts p ON p.id = i.source_post_id
       JOIN knowledge_contributors c ON c.item_id = i.id AND c.person_id = ? AND c.state = 'ok'
       WHERE i.id = ?`,
    )
    .get(personId, personId, itemId) as { created_at: string; post_author: string; answered: number } | undefined;
  if (!item || now.getTime() - Date.parse(item.created_at) < LONG_AGO_MS) return;
  if (item.post_author === personId) log(db, personId, "found-own-post", itemId, now);
  if (item.answered === 1) log(db, personId, "found-own-answer", itemId, now);
}
