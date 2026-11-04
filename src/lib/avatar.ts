import type { DatabaseSync } from "node:sqlite";
import { catalogEntry } from "./avatar-catalog";

export type Kind = "creature" | "human";
export type Style = "listen" | "make" | "lead" | "think";

/** 最初の問いかけで卵を決める。 */
const FAMILIES: Record<Kind, Record<Style, string>> = {
  creature: { listen: "bird", make: "beast", lead: "dragon", think: "spirit" },
  human: { listen: "elder", make: "craft", lead: "jacket", think: "coat" },
};

export const STYLE_QUESTION = {
  question: "誰かの役に立つとしたら、どれが一番近いですか？",
  options: [
    { value: "listen", label: "じっくり話を聞く" },
    { value: "make", label: "手を動かして作る" },
    { value: "lead", label: "声をかけて引っぱる" },
    { value: "think", label: "よく調べて考える" },
  ],
} as const;

export const KIND_QUESTION = {
  question: "どんな相棒と一緒にいたいですか？",
  options: [
    { value: "creature", label: "生き物" },
    { value: "human", label: "人物" },
  ],
} as const;

/** 写真を読んでいる間の仮の系統。卵のまま待つ */
export const PENDING_FAMILY = "photo";

function isCreature(family: string): boolean {
  return family === PENDING_FAMILY || catalogEntry(family)?.group === "creature";
}

export type Contributions = {
  posts: number;
  comments: number;
  cheers: number;
  goals: number;
  assists: number;
  thanksReceived: number;
};

export type AvatarView = {
  family: string | null;
  stage: number;
  image: string;
  label: string;
};

export function familyFor(kind: unknown, style: unknown): string | null {
  if (kind !== "creature" && kind !== "human") return null;
  if (style !== "listen" && style !== "make" && style !== "lead" && style !== "think") return null;
  return FAMILIES[kind][style];
}

export function countContributions(db: DatabaseSync, personId: string): Contributions {
  const one = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { count: number }).count;
  return {
    posts: one("SELECT count(*) AS count FROM posts WHERE author_id = ? AND kind != 'notice'", personId),
    comments: one("SELECT count(*) AS count FROM replies WHERE author_id = ?", personId),
    cheers: one("SELECT count(*) AS count FROM post_likes WHERE person_id = ?", personId),
    goals: one(
      `SELECT count(DISTINCT p.id) AS count FROM posts p
       JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
       WHERE p.asked_person_id = ?`,
      personId,
    ),
    assists: one(
      `SELECT count(DISTINCT x.post_id) AS count FROM post_passes x
       JOIN posts p ON p.id = x.post_id
       JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
       WHERE x.from_person_id = ?`,
      personId,
    ),
    thanksReceived: one("SELECT count(*) AS count FROM thanks WHERE to_person_id = ?", personId),
  };
}

/**
 * 人とのやり取りで育つ。えさやりはなく、Claude と話すだけでは育たない。
 * 回数はこの表で段階にするだけで、人と比べる点数としては見せない。
 */
export function stageFor(family: string, contributions: Contributions): number {
  const score =
    contributions.posts +
    contributions.comments +
    contributions.cheers +
    contributions.goals * 2 +
    contributions.assists * 2 +
    contributions.thanksReceived * 2;
  const steps = isCreature(family) ? [1, 4, 10] : [3, 7, 12, 20];
  const passed = steps.filter((step) => score >= step).length;
  return isCreature(family) ? passed : passed + 1;
}

/** 見せる段階。本人が進化を選ぶまでは今の姿のまま。記録がない人は、育った分をそのまま見せる。 */
export function shownStage(db: DatabaseSync, personId: string, family: string, shown: number | null): number {
  return shown ?? stageFor(family, countContributions(db, personId));
}

export function getAvatar(db: DatabaseSync, personId: string): AvatarView {
  const row = db.prepare("SELECT family, shown_stage FROM avatars WHERE person_id = ?").get(personId) as
    | { family: string; shown_stage: number | null }
    | undefined;
  if (!row) return { family: null, stage: 0, image: "egg.png", label: "まだ卵です" };

  const stage = shownStage(db, personId, row.family, row.shown_stage);
  const art = db.prepare("SELECT token, status FROM avatar_art WHERE person_id = ? AND status != 'none'").get(personId) as
    | { token: string; status: string }
    | undefined;
  if (art) {
    // 絵は系統と段階で変わるので、URL に入れて古い絵を残さない
    // 読み取れなかったときは、コードで描いた絵が normal で出る
    const asEgg = stage === 0 || art.status === "pending";
    const pose = asEgg ? "egg" : "normal";
    const label = asEgg ? "もうすぐ生まれそうな卵" : `${stage} 段階目の相棒`;
    return { family: row.family, stage, image: `/api/avatar/art/${art.token}/${pose}?v=${row.family}-${stage}`, label };
  }
  if (stage === 0) return { family: row.family, stage, image: "egg.png", label: "もうすぐ生まれそうな卵" };
  return { family: row.family, stage, image: `${row.family}-${stage}.png`, label: `${stage} 段階目の相棒` };
}


export function chooseAvatar(db: DatabaseSync, personId: string, kind: unknown, style: unknown): boolean {
  const family = familyFor(kind, style);
  if (!family) return false;
  // 選び直しで育ちが消えないよう、一度決めた系統は変えない
  const result = db
    .prepare("INSERT OR IGNORE INTO avatars (person_id, family, shown_stage) VALUES (?, ?, ?)")
    .run(personId, family, stageFor(family, countContributions(db, personId)));
  return result.changes === 1;
}

export function handleChooseAvatar(db: DatabaseSync, personId: string, input: unknown) {
  const { kind, style } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (!familyFor(kind, style)) return { status: 400, body: { error: "選べませんでした" } };
  // 別の画面ですでに決めていても、失敗にしない（一度決めた系統は変わらない）
  chooseAvatar(db, personId, kind, style);
  return { status: 200, body: { avatar: getAvatar(db, personId) } };
}
