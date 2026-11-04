import type { DatabaseSync } from "node:sqlite";
import { EVENTS, isInEvent, type SchoolEvent } from "./events";

export type RibbonDefinition = { id: string; name: string; description: string };

/** 人を助けた行動を中心にする。投稿や応援の回数では増えない。 */
export const RIBBONS: readonly RibbonDefinition[] = [
  { id: "first-answer", name: "はじめての一言", description: "誰かの質問や相談に、初めて答えた" },
  { id: "thanks", name: "ありがとうの人", description: "ありがとうをもらった" },
  { id: "knowledge-helped", name: "知恵の贈り主", description: "あなたの言葉が入った知恵に、いいねが届いた" },
  { id: "pass", name: "つなぎ手", description: "パスでつないだ相談に、答えが届いた" },
  { id: "note-helped", name: "ひとこと名人", description: "書いた注釈が役に立つと言われた" },
];

const ALL: readonly RibbonDefinition[] = [...RIBBONS, ...EVENTS.map((event) => event.ribbon)];

export type RibbonView = RibbonDefinition & { isPublic: boolean };

function has(db: DatabaseSync, sql: string, ...args: string[]): boolean {
  return db.prepare(sql).get(...args) !== undefined;
}

/** 誰かの質問や相談への返事か。投稿した本人の追記は入れない。 */
const ANSWER_SQL = `SELECT r.created_at FROM replies r JOIN posts p ON p.id = r.post_id
  WHERE r.author_id = ? AND p.author_id != r.author_id
    AND (p.kind IN ('trouble', 'worry') OR p.asked_person_id = r.author_id)`;

function earnedNow(db: DatabaseSync, personId: string): string[] {
  const earned: string[] = [];
  if (has(db, `${ANSWER_SQL} LIMIT 1`, personId)) earned.push("first-answer");
  if (has(db, "SELECT 1 FROM thanks WHERE to_person_id = ? AND from_person_id != to_person_id LIMIT 1", personId)) earned.push("thanks");
  if (
    has(
      db,
      `SELECT 1 FROM knowledge_contributors c
       JOIN knowledge_items i ON i.id = c.item_id
       JOIN knowledge_reviews r ON r.item_id = i.id
       WHERE c.person_id = ? AND c.state = 'ok' AND i.status = 'shared' AND r.verdict = 'like' AND r.reviewer_id != c.person_id
       LIMIT 1`,
      personId,
    )
  ) {
    earned.push("knowledge-helped");
  }
  if (
    has(
      db,
      `SELECT 1 FROM post_passes x JOIN posts p ON p.id = x.post_id
       JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
       WHERE x.from_person_id = ? LIMIT 1`,
      personId,
    )
  ) {
    earned.push("pass");
  }
  if (
    has(
      db,
      `SELECT 1 FROM knowledge_notes n
       WHERE n.author_id = ?
         AND (SELECT count(*) FROM knowledge_note_votes v WHERE v.note_id = n.id AND v.person_id != n.author_id) >= 2
       LIMIT 1`,
      personId,
    )
  ) {
    earned.push("note-helped");
  }
  return earned;
}

/** その期間の中で、誰かの力になったか。答えや、ありがとうを送ったことで数える。 */
function helpedDuring(db: DatabaseSync, personId: string, event: SchoolEvent): boolean {
  const inPeriod = (created: string) => isInEvent(event, new Date(created));
  const answers = db.prepare(ANSWER_SQL).all(personId) as { created_at: string }[];
  const thanks = db.prepare("SELECT created_at FROM thanks WHERE from_person_id = ?").all(personId) as { created_at: string }[];
  return [...answers, ...thanks].some((row) => inPeriod(row.created_at));
}

/**
 * 条件を満たしたリボンを記録する。一度もらったら、元の行動が取り消されても減らない。
 * 分身を隠している人にも、裏で集まる。
 */
export function syncRibbons(db: DatabaseSync, personId: string, now: Date, events: readonly SchoolEvent[] = EVENTS): void {
  const insert = db.prepare("INSERT OR IGNORE INTO person_ribbons (person_id, ribbon_id, earned_at) VALUES (?, ?, ?)");
  const stamp = now.toISOString();
  for (const ribbonId of earnedNow(db, personId)) insert.run(personId, ribbonId, stamp);
  for (const event of events) {
    if (isInEvent(event, now) && helpedDuring(db, personId, event)) insert.run(personId, event.ribbon.id, stamp);
  }
}

type Row = { ribbon_id: string; is_public: number };

function toViews(rows: Row[]): RibbonView[] {
  // 並びは定義の順だけ。人と比べる順位や数は作らない
  return ALL.flatMap((ribbon) => {
    const row = rows.find((r) => r.ribbon_id === ribbon.id);
    return row ? [{ ...ribbon, isPublic: row.is_public === 1 }] : [];
  });
}

export function listRibbons(db: DatabaseSync, personId: string): RibbonView[] {
  return toViews(db.prepare("SELECT ribbon_id, is_public FROM person_ribbons WHERE person_id = ?").all(personId) as Row[]);
}

/** 他の人のプロフィールに出す分。本人が公開を選んだものだけ。 */
export function listPublicRibbons(db: DatabaseSync, personId: string): RibbonDefinition[] {
  return listRibbons(db, personId)
    .filter((ribbon) => ribbon.isPublic)
    .map(({ id, name, description }) => ({ id, name, description }));
}

/** まだ本人に見せていないリボン。もらった瞬間の演出に使う。 */
export function listNewRibbons(db: DatabaseSync, personId: string): RibbonDefinition[] {
  const rows = db.prepare("SELECT ribbon_id, is_public FROM person_ribbons WHERE person_id = ? AND seen_at IS NULL").all(personId) as Row[];
  return toViews(rows).map(({ id, name, description }) => ({ id, name, description }));
}

export function handleRibbon(db: DatabaseSync, personId: string, input: unknown, now: Date = new Date()) {
  const { action, id, isPublic } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (action === "seen") {
    db.prepare("UPDATE person_ribbons SET seen_at = ? WHERE person_id = ? AND seen_at IS NULL").run(now.toISOString(), personId);
    return { status: 200, body: { ok: true } };
  }
  if (action === "public" && typeof id === "string" && typeof isPublic === "boolean") {
    const { changes } = db
      .prepare("UPDATE person_ribbons SET is_public = ? WHERE person_id = ? AND ribbon_id = ?")
      .run(isPublic ? 1 : 0, personId, id);
    return changes === 1 ? { status: 200, body: { ok: true } } : { status: 404, body: { error: "見つかりません" } };
  }
  return { status: 400, body: { error: "依頼が正しくありません" } };
}
