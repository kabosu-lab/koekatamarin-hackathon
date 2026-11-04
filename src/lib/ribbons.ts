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

/** 本人に見せる物語。プロフィールには出さない（ありがとうなどは本人だけのやり取りなので）。 */
export type RibbonStory = { story: string; storyAt: string | null };
export type RibbonView = RibbonDefinition & RibbonStory & { isPublic: boolean };
export type NewRibbon = RibbonDefinition & { story: string };

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

type Source = { name?: string | null; title?: string | null; at: string };

/** 公開の投稿のときだけ相手の名前を出す。範囲を絞った投稿は、相手も中身も出さない。 */
function storyFor(db: DatabaseSync, personId: string, ribbonId: string): { story: string; at: string | null } {
  const first = (sql: string, ...args: string[]) => db.prepare(sql).get(...args) as Source | undefined;
  switch (ribbonId) {
    case "first-answer": {
      const row = first(
        `SELECT CASE WHEN p.scope = 'everyone' THEN a.name END AS name, r.created_at AS at
         FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = p.author_id
         WHERE r.author_id = ? AND p.author_id != r.author_id
           AND (p.kind IN ('trouble', 'worry') OR p.asked_person_id = r.author_id)
         ORDER BY r.created_at, r.rowid LIMIT 1`,
        personId,
      );
      return { story: row?.name ? `${row.name}さんの相談に、初めて答えた日` : "誰かの相談に、初めて答えた日", at: row?.at ?? null };
    }
    case "thanks": {
      const row = first(
        `SELECT a.name AS name, t.created_at AS at FROM thanks t JOIN people a ON a.id = t.from_person_id
         WHERE t.to_person_id = ? AND t.from_person_id != t.to_person_id ORDER BY t.created_at, t.rowid LIMIT 1`,
        personId,
      );
      return { story: row?.name ? `${row.name}さんから、ありがとうが届いた日` : "ありがとうが届いた日", at: row?.at ?? null };
    }
    case "knowledge-helped": {
      const row = first(
        `SELECT i.title AS title, v.created_at AS at FROM knowledge_contributors c
         JOIN knowledge_items i ON i.id = c.item_id
         JOIN knowledge_reviews v ON v.item_id = i.id
         WHERE c.person_id = ? AND c.state = 'ok' AND i.status = 'shared' AND v.verdict = 'like' AND v.reviewer_id != c.person_id
         ORDER BY v.created_at, v.rowid LIMIT 1`,
        personId,
      );
      return { story: row?.title ? `「${row.title}」に、いいねが届いた日` : "あなたの知恵に、いいねが届いた日", at: row?.at ?? null };
    }
    case "pass": {
      const row = first(
        `SELECT CASE WHEN p.scope = 'everyone' THEN a.name END AS name, r.created_at AS at
         FROM post_passes x JOIN posts p ON p.id = x.post_id
         JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
         JOIN people a ON a.id = p.author_id
         WHERE x.from_person_id = ? ORDER BY r.created_at, r.rowid LIMIT 1`,
        personId,
      );
      return { story: row?.name ? `${row.name}さんの相談を、つないで届けた日` : "つないだ相談に、答えが届いた日", at: row?.at ?? null };
    }
    case "note-helped": {
      const row = first(
        `SELECT i.title AS title, n.created_at AS at FROM knowledge_notes n JOIN knowledge_items i ON i.id = n.item_id
         WHERE n.author_id = ?
           AND (SELECT count(*) FROM knowledge_note_votes v WHERE v.note_id = n.id AND v.person_id != n.author_id) >= 2
         ORDER BY n.created_at, n.rowid LIMIT 1`,
        personId,
      );
      return { story: row?.title ? `「${row.title}」に書いた注釈が、役に立つと言われた日` : "書いた注釈が、役に立つと言われた日", at: row?.at ?? null };
    }
    default: {
      const event = EVENTS.find((e) => e.ribbon.id === ribbonId);
      return { story: event ? `${event.name}に、誰かの力になった日` : "誰かの力になった日", at: null };
    }
  }
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
  // 物語は最初の一度だけ決める。あとで投稿が変わっても書き換えない
  const untold = db.prepare("SELECT ribbon_id, earned_at FROM person_ribbons WHERE person_id = ? AND story IS NULL").all(personId) as {
    ribbon_id: string;
    earned_at: string;
  }[];
  const tell = db.prepare("UPDATE person_ribbons SET story = ?, story_at = ? WHERE person_id = ? AND ribbon_id = ?");
  for (const { ribbon_id: ribbonId, earned_at: earnedAt } of untold) {
    const { story, at } = storyFor(db, personId, ribbonId);
    tell.run(story, at ?? earnedAt, personId, ribbonId);
  }
}

type Row = { ribbon_id: string; is_public: number; story: string | null; story_at: string | null };

function toViews(rows: Row[]): RibbonView[] {
  // 並びは定義の順だけ。人と比べる順位や数は作らない
  return ALL.flatMap((ribbon) => {
    const row = rows.find((r) => r.ribbon_id === ribbon.id);
    return row ? [{ ...ribbon, isPublic: row.is_public === 1, story: row.story ?? ribbon.description, storyAt: row.story_at }] : [];
  });
}

export function listRibbons(db: DatabaseSync, personId: string): RibbonView[] {
  return toViews(db.prepare("SELECT ribbon_id, is_public, story, story_at FROM person_ribbons WHERE person_id = ?").all(personId) as Row[]);
}

/** 他の人のプロフィールに出す分。本人が公開を選んだものだけ。 */
export function listPublicRibbons(db: DatabaseSync, personId: string): RibbonDefinition[] {
  return listRibbons(db, personId)
    .filter((ribbon) => ribbon.isPublic)
    .map(({ id, name, description }) => ({ id, name, description }));
}

/** まだ本人に見せていないリボン。もらった瞬間の演出に使う。 */
export function listNewRibbons(db: DatabaseSync, personId: string): NewRibbon[] {
  const rows = db.prepare("SELECT ribbon_id, is_public, story, story_at FROM person_ribbons WHERE person_id = ? AND seen_at IS NULL").all(personId) as Row[];
  return toViews(rows).map(({ id, name, description, story }) => ({ id, name, description, story }));
}

/** シール帳の台紙。もらっていないものは影だけにする。順位や割合は出さない。 */
export const STICKER_SLOTS: readonly RibbonDefinition[] = RIBBONS;
export const EVENT_SLOTS: readonly RibbonDefinition[] = EVENTS.map((event) => event.ribbon);

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
