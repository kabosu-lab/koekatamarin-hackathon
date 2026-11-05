import type { DatabaseSync } from "node:sqlite";
import { EVENTS, isInEvent, type SchoolEvent } from "./events";
import { CATEGORY_LABELS, type TrophyCategory, type TrophyDefinition, type TrophyEmblem, TROPHIES } from "./trophies";
import { TROPHY_RULES } from "./trophy-rules";

/**
 * トロフィーの記録と表示。リボンの仕組みを引き継いでいるので、表と関数の名前はリボンのまま。
 * 見せ方と増えた実績は trophies.ts、判定は trophy-rules.ts にある。
 */
export type TrophyArt = { category: TrophyCategory; emblem: TrophyEmblem };

/** 本人に見せる物語。プロフィールには出さない（ありがとうなどは本人だけのやり取りなので）。 */
export type RibbonStory = { story: string; storyAt: string | null };
export type RibbonView = {
  id: string;
  name: string;
  description: string;
  quip: string | null;
  hidden: boolean;
  /** プロフィールに出せないもの */
  selfOnly: boolean;
  art: TrophyArt;
} & RibbonStory & { isPublic: boolean };
export type NewRibbon = Pick<RibbonView, "id" | "name" | "description" | "quip" | "hidden" | "art" | "story">;
export type PublicRibbon = Pick<RibbonView, "id" | "name" | "description" | "art">;

/** 棚の1枠。取っていない隠しトロフィーには、名前も条件も ID も渡さない。 */
export type ShelfSlot =
  | { key: string; state: "earned"; trophy: RibbonView }
  | { key: string; state: "open"; name: string; description: string; art: TrophyArt }
  | { key: string; state: "secret" };
export type TrophyShelf = { category: TrophyCategory; label: string; complete: boolean; slots: ShelfSlot[] };

function eventTrophy(event: SchoolEvent): TrophyDefinition {
  return { ...event.ribbon, category: "event", emblem: "star" };
}

const ALL: readonly TrophyDefinition[] = [...TROPHIES, ...EVENTS.map(eventTrophy)];

function artOf(definition: TrophyDefinition): TrophyArt {
  return { category: definition.category, emblem: definition.emblem };
}

/** その期間の中で、誰かの力になったか。答えや、ありがとうを送ったことで数える。 */
function helpedDuring(db: DatabaseSync, personId: string, event: SchoolEvent): boolean {
  const inPeriod = (created: string) => isInEvent(event, new Date(created));
  const answers = db
    .prepare(
      `SELECT r.created_at FROM replies r JOIN posts p ON p.id = r.post_id
       WHERE r.author_id = ? AND p.author_id != r.author_id
         AND (p.kind IN ('trouble', 'worry') OR p.asked_person_id = r.author_id)`,
    )
    .all(personId) as { created_at: string }[];
  const thanks = db.prepare("SELECT created_at FROM thanks WHERE from_person_id = ?").all(personId) as { created_at: string }[];
  return [...answers, ...thanks].some((row) => inPeriod(row.created_at));
}

function eventStory(ribbonId: string): string {
  const event = EVENTS.find((e) => e.ribbon.id === ribbonId);
  return event ? `${event.name}に、誰かの力になった日` : "誰かの力になった日";
}

/**
 * 条件を満たしたトロフィーを記録する。一度もらったら、元の行動が取り消されても減らない。
 * モダンの人や分身を隠している人にも、裏で集まる。物語は最初の一度だけ決める。
 */
export function syncRibbons(db: DatabaseSync, personId: string, now: Date, events: readonly SchoolEvent[] = EVENTS): void {
  const rows = db.prepare("SELECT ribbon_id, story, earned_at FROM person_ribbons WHERE person_id = ?").all(personId) as {
    ribbon_id: string;
    story: string | null;
    earned_at: string;
  }[];
  const earned = new Set(rows.map((row) => row.ribbon_id));
  const insert = db.prepare("INSERT OR IGNORE INTO person_ribbons (person_id, ribbon_id, earned_at, story, story_at) VALUES (?, ?, ?, ?, ?)");
  const stamp = now.toISOString();

  for (const trophy of TROPHIES) {
    if (earned.has(trophy.id)) continue;
    const hit = TROPHY_RULES[trophy.id](db, personId, now);
    if (hit) insert.run(personId, trophy.id, stamp, hit.story, hit.at ?? stamp);
  }
  for (const event of events) {
    if (!earned.has(event.ribbon.id) && isInEvent(event, now) && helpedDuring(db, personId, event)) {
      insert.run(personId, event.ribbon.id, stamp, eventStory(event.ribbon.id), stamp);
    }
  }
  // 物語が入る前にもらったリボン
  const tell = db.prepare("UPDATE person_ribbons SET story = ?, story_at = ? WHERE person_id = ? AND ribbon_id = ?");
  for (const row of rows) {
    if (row.story !== null) continue;
    const hit = TROPHY_RULES[row.ribbon_id]?.(db, personId, now) ?? null;
    tell.run(hit?.story ?? eventStory(row.ribbon_id), hit?.at ?? row.earned_at, personId, row.ribbon_id);
  }
}

type Row = { ribbon_id: string; is_public: number; story: string | null; story_at: string | null };

function toView(trophy: TrophyDefinition, row: Row): RibbonView {
  return {
    id: trophy.id,
    name: trophy.name,
    description: trophy.description,
    quip: trophy.quip ?? null,
    hidden: trophy.hidden === true,
    selfOnly: trophy.selfOnly === true,
    art: artOf(trophy),
    isPublic: row.is_public === 1 && trophy.selfOnly !== true,
    story: row.story ?? trophy.description,
    storyAt: row.story_at,
  };
}

function toViews(rows: Row[]): RibbonView[] {
  // 並びは定義の順だけ。人と比べる順位や数は作らない
  return ALL.flatMap((trophy) => {
    const row = rows.find((r) => r.ribbon_id === trophy.id);
    return row ? [toView(trophy, row)] : [];
  });
}

export function listRibbons(db: DatabaseSync, personId: string): RibbonView[] {
  return toViews(db.prepare("SELECT ribbon_id, is_public, story, story_at FROM person_ribbons WHERE person_id = ?").all(personId) as Row[]);
}

/** 他の人のプロフィールに出す分。本人が公開を選んだものだけ。隠しトロフィーの条件は、見る人がまだ取っていないかもしれないので書かない。 */
export function listPublicRibbons(db: DatabaseSync, personId: string): PublicRibbon[] {
  return listRibbons(db, personId)
    .filter((ribbon) => ribbon.isPublic)
    .map(({ id, name, description, hidden, art }) => ({ id, name, description: hidden ? "隠しトロフィー" : description, art }));
}

/** まだ本人に見せていないトロフィー。もらった瞬間の演出に使う。 */
export function listNewRibbons(db: DatabaseSync, personId: string): NewRibbon[] {
  const rows = db.prepare("SELECT ribbon_id, is_public, story, story_at FROM person_ribbons WHERE person_id = ? AND seen_at IS NULL").all(personId) as Row[];
  return toViews(rows).map(({ id, name, description, quip, hidden, art, story }) => ({ id, name, description, quip, hidden, art, story }));
}

/** トロフィーの棚。もらっていないものは影だけにする。順位や割合は出さない。期間限定の棚は、もらってから出す。 */
export function listTrophyShelves(db: DatabaseSync, personId: string): TrophyShelf[] {
  const earned = new Map(listRibbons(db, personId).map((ribbon) => [ribbon.id, ribbon]));
  const categories = Object.keys(CATEGORY_LABELS) as TrophyCategory[];
  return categories.flatMap((category): TrophyShelf[] => {
    let secrets = 0;
    const slots = ALL.filter((trophy) => trophy.category === category).flatMap((trophy): ShelfSlot[] => {
      const mine = earned.get(trophy.id);
      if (mine) return [{ key: trophy.id, state: "earned", trophy: mine }];
      if (category === "event") return [];
      if (trophy.hidden) {
        secrets += 1;
        return [{ key: `secret-${secrets}`, state: "secret" }];
      }
      return [{ key: trophy.id, state: "open", name: trophy.name, description: trophy.description, art: artOf(trophy) }];
    });
    if (slots.length === 0) return [];
    return [{ category, label: CATEGORY_LABELS[category], complete: slots.every((slot) => slot.state === "earned"), slots }];
  });
}

export function handleRibbon(db: DatabaseSync, personId: string, input: unknown, now: Date = new Date()) {
  const { action, id, isPublic } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (action === "seen") {
    db.prepare("UPDATE person_ribbons SET seen_at = ? WHERE person_id = ? AND seen_at IS NULL").run(now.toISOString(), personId);
    return { status: 200, body: { ok: true } };
  }
  if (action === "public" && typeof id === "string" && typeof isPublic === "boolean") {
    if (ALL.find((trophy) => trophy.id === id)?.selfOnly) return { status: 400, body: { error: "プロフィールには出せません" } };
    const { changes } = db
      .prepare("UPDATE person_ribbons SET is_public = ? WHERE person_id = ? AND ribbon_id = ?")
      .run(isPublic ? 1 : 0, personId, id);
    return changes === 1 ? { status: 200, body: { ok: true } } : { status: 404, body: { error: "見つかりません" } };
  }
  return { status: 400, body: { error: "依頼が正しくありません" } };
}
