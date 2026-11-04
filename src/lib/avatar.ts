import type { DatabaseSync } from "node:sqlite";

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

/** 写真から作った分身。卵から育つ */
const CREATURE_FAMILIES = new Set<string>([...Object.values(FAMILIES.creature), "photo"]);

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
  const steps = CREATURE_FAMILIES.has(family) ? [1, 4, 10] : [3, 7, 12, 20];
  const passed = steps.filter((step) => score >= step).length;
  return CREATURE_FAMILIES.has(family) ? passed : passed + 1;
}

export function getAvatar(db: DatabaseSync, personId: string): AvatarView {
  const row = db.prepare("SELECT family FROM avatars WHERE person_id = ?").get(personId) as
    | { family: string }
    | undefined;
  if (!row) return { family: null, stage: 0, image: "egg.png", label: "まだ卵です" };

  const stage = stageFor(row.family, countContributions(db, personId));
  const art = db.prepare("SELECT token, body, status FROM avatar_art WHERE person_id = ? AND (body IS NOT NULL OR status IN ('pending', 'failed'))").get(personId) as
    | { token: string; body: string | null; status: string }
    | undefined;
  if (art) {
    // 描いた絵は段階ごとに変わるので、段階を URL に入れて古い絵を残さない
    // 描けなかったときは、コードで描いた絵が normal で出る
    const asEgg = stage === 0 || (!art.body && art.status === "pending");
    const pose = asEgg ? "egg" : "normal";
    const label = asEgg ? "写真の色の卵" : `${stage} 段階目の相棒`;
    return { family: row.family, stage, image: `/api/avatar/art/${art.token}/${pose}?v=${stage}`, label };
  }
  if (stage === 0) return { family: row.family, stage, image: "egg.png", label: "もうすぐ生まれそうな卵" };
  return { family: row.family, stage, image: `${row.family}-${stage}.png`, label: `${stage} 段階目の相棒` };
}

export function chooseAvatar(db: DatabaseSync, personId: string, kind: unknown, style: unknown): boolean {
  const family = familyFor(kind, style);
  if (!family) return false;
  // 選び直しで育ちが消えないよう、一度決めた系統は変えない
  const result = db.prepare("INSERT OR IGNORE INTO avatars (person_id, family) VALUES (?, ?)").run(personId, family);
  return result.changes === 1;
}

export function handleChooseAvatar(db: DatabaseSync, personId: string, input: unknown) {
  const { kind, style } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (!chooseAvatar(db, personId, kind, style)) return { status: 400, body: { error: "選べませんでした" } };
  return { status: 200, body: { avatar: getAvatar(db, personId) } };
}
