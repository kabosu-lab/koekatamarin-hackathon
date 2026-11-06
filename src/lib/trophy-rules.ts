import type { DatabaseSync } from "node:sqlite";
import { bloomFor, countLeaves, fiscalYearStart, seasonOf } from "./sakura";
import { isLateNight } from "./study";
import { keywordsOf } from "./today";
import { BLOOM_DAY, EQUIPMENT_CHANNELS } from "./trophies";
import { hasLogged, type TrophyLogKind } from "./trophy-log";

/** 取れたときの一言と、その日。at がなければ、気づいた日を使う。 */
export type TrophyHit = { story: string; at: string | null };
type Rule = (db: DatabaseSync, personId: string, now: Date) => TrophyHit | null;
type Row = Record<string, string | number | null>;

/**
 * 判定に使うのは、操作の記録、校内に公開された投稿と返信、知恵の記録だけ。Claude との話は使わない。
 * 誰が一人かは判定せず、返事のない投稿を探す画面も作らない。ここでは終わったことだけを見る。
 */
const CONSULT = "p.kind IN ('trouble', 'worry')";
/** 校内に公開された相談への、他の人の返事。 */
const PUBLIC_ANSWER = `r.author_id = ? AND p.author_id != r.author_id AND p.scope = 'everyone' AND ${CONSULT}`;

const HALF_YEAR_DAYS = 183;
const RETURN_GAP_MS = 30 * 86_400_000;
const LEGEND_LIKES = 3;
const TIMES = 3;
const THANKS_PEOPLE = 10;

function one(db: DatabaseSync, sql: string, ...args: string[]): Row | null {
  return (db.prepare(sql).get(...args) as Row | undefined) ?? null;
}

function all(db: DatabaseSync, sql: string, ...args: string[]): Row[] {
  return db.prepare(sql).all(...args) as Row[];
}

const text = (value: string | number | null | undefined): string => (value === null || value === undefined ? "" : String(value));

function fromLog(kind: TrophyLogKind, story: string): Rule {
  return (db, personId) => {
    const logged = hasLogged(db, personId, kind);
    return logged ? { story, at: logged.at } : null;
  };
}

/** 肩書きの中の学年と部活。列がないので、表示の文字から読む。 */
export function affiliationOf(label: string): { grade: string | null; club: string | null } {
  return { grade: label.match(/[1-3１-３]年/)?.[0] ?? null, club: label.match(/[^・\s]+部/)?.[0] ?? null };
}

function differs(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a !== b;
}

function dateInJapan(at: string | Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(at));
}

function likedItems(db: DatabaseSync, personId: string, extra = ""): Row[] {
  return all(
    db,
    `SELECT i.id, i.title, i.created_at AS item_at, v.created_at AS at, v.reviewer_id
     FROM knowledge_contributors c
     JOIN knowledge_items i ON i.id = c.item_id
     JOIN knowledge_reviews v ON v.item_id = i.id
     WHERE c.person_id = ? AND c.state = 'ok' AND i.status = 'shared' AND v.verdict = 'like' AND v.reviewer_id != c.person_id ${extra}
     ORDER BY v.created_at, v.rowid`,
    personId,
  );
}

/** いいねの人数がそろった知恵。 */
function itemWithLikes(rows: Row[], enough: number): TrophyHit | null {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const count = (seen.get(text(row.id)) ?? 0) + 1;
    seen.set(text(row.id), count);
    if (count === enough) return { story: `「${text(row.title)}」に、${enough}人からいいねが届いた日`, at: text(row.at) };
  }
  return null;
}

function sharedOfTopic(db: DatabaseSync, personId: string, topic: string, story: (title: string) => string): TrophyHit | null {
  const row = one(
    db,
    `SELECT i.title, i.updated_at AS at FROM knowledge_contributors c JOIN knowledge_items i ON i.id = c.item_id
     WHERE c.person_id = ? AND c.state = 'ok' AND i.status = 'shared' AND i.topic = ? ORDER BY i.created_at, i.rowid LIMIT 1`,
    personId,
    topic,
  );
  return row ? { story: story(text(row.title)), at: text(row.at) } : null;
}

/** パスした相談のうち、答えが届いたもの。 */
function resolvedPasses(db: DatabaseSync, personId: string): Row[] {
  return all(
    db,
    `SELECT DISTINCT p.id, CASE WHEN p.scope = 'everyone' THEN a.name END AS name, r.created_at AS at
     FROM post_passes x JOIN posts p ON p.id = x.post_id
     JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
     JOIN people a ON a.id = p.author_id
     WHERE x.from_person_id = ? ORDER BY r.created_at, r.rowid`,
    personId,
  );
}

function helpDates(db: DatabaseSync, personId: string): string[] {
  return [
    ...all(db, `SELECT r.created_at AS at FROM replies r JOIN posts p ON p.id = r.post_id WHERE ${PUBLIC_ANSWER}`, personId),
    ...all(db, "SELECT created_at AS at FROM thanks WHERE from_person_id = ?", personId),
  ].map((row) => text(row.at));
}

/** 立場は肩書き（label）と役割（role）から読む。個人の名前では決めない。 */
type Stance = { id: string; role: string; label: string };
const isNurse = (who: Stance) => /養護/.test(who.label);
const isGradeHead = (who: Stance) => /学年主任|学年長/.test(who.label);
// 副担任は担任に数えない
const isHomeroomLabel = (who: Stance) => /(?<!副)担任/.test(who.label);
const isManager = (who: Stance) => who.role === "admin" || /校長|教頭/.test(who.label);
const isGuidance = (who: Stance) => /生徒指導/.test(who.label);

/** 「めずらしい」とみなす、返事の前30日のやり取り（投稿と返事）の数の上限 */
const RARE_MAX = 3;
const RARE_WINDOW_MS = 30 * 86_400_000;

/** 自分の投稿に、他の人から届いた返事（Teams から取り込んだものも同じ表に入る）。 */
function repliesToMe(db: DatabaseSync, personId: string): (Stance & { replyId: string; at: string })[] {
  return all(
    db,
    `SELECT a.id, a.role, a.label, r.id AS reply_id, r.created_at AS at
     FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = r.author_id
     WHERE p.author_id = ? AND r.author_id != p.author_id ORDER BY r.created_at, r.rowid`,
    personId,
  ).map((row) => ({ id: text(row.id), role: text(row.role), label: text(row.label), replyId: text(row.reply_id), at: text(row.at) }));
}

/** 自分の投稿に、他の人から届いたいいね。いいねには日時がないので、気づいた日を使う。 */
function likesToMe(db: DatabaseSync, personId: string): Stance[] {
  return all(
    db,
    `SELECT a.id, a.role, a.label FROM post_likes l JOIN posts p ON p.id = l.post_id JOIN people a ON a.id = l.person_id
     WHERE p.author_id = ? AND l.person_id != p.author_id ORDER BY p.created_at`,
    personId,
  ).map((row) => ({ id: text(row.id), role: text(row.role), label: text(row.label) }));
}

/** 名前は書かない（立場で決めるトロフィーなので、物語も立場で語る）。 */
function fromStance(match: (who: Stance) => boolean, ways: { replies: boolean; likes: boolean }, replyStory: string, likeStory: string): Rule {
  return (db, personId) => {
    if (ways.replies) {
      const reply = repliesToMe(db, personId).find(match);
      if (reply) return { story: replyStory, at: reply.at };
    }
    if (ways.likes && likesToMe(db, personId).some(match)) return { story: likeStory, at: null };
    return null;
  };
}

/** 生徒は自分の担任から。担任の決まっていない人は、肩書きの「担任」で読む。 */
function isMyHomeroom(db: DatabaseSync, personId: string): (who: Stance) => boolean {
  const mine = text(one(db, "SELECT homeroom_teacher_id AS id FROM people WHERE id = ?", personId)?.id);
  return (who) => (mine ? who.id === mine : isHomeroomLabel(who));
}

/** リボンの判定と物語は、そのまま引き継ぐ。範囲を絞った投稿は、相手の名前を出さない。 */
export const TROPHY_RULES: Record<string, Rule> = {
  "first-answer": (db, personId) => {
    const row = one(
      db,
      `SELECT CASE WHEN p.scope = 'everyone' THEN a.name END AS name, r.created_at AS at
       FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = p.author_id
       WHERE r.author_id = ? AND p.author_id != r.author_id AND (${CONSULT} OR p.asked_person_id = r.author_id)
       ORDER BY r.created_at, r.rowid LIMIT 1`,
      personId,
    );
    if (!row) return null;
    return { story: row.name ? `${text(row.name)}さんの相談に、初めて答えた日` : "誰かの相談に、初めて答えた日", at: text(row.at) };
  },

  "first-responder": (db, personId) => {
    const row = one(
      db,
      `SELECT a.name, r.created_at AS at FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = p.author_id
       WHERE ${PUBLIC_ANSWER}
         AND NOT EXISTS (SELECT 1 FROM replies e WHERE e.post_id = p.id AND e.author_id != p.author_id
                         AND (e.created_at < r.created_at OR (e.created_at = r.created_at AND e.rowid < r.rowid)))
       ORDER BY r.created_at, r.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `${text(row.name)}さんの相談に、いちばん最初に答えた日`, at: text(row.at) } : null;
  },

  repay: (db, personId) => {
    const row = one(
      db,
      `SELECT y.name, mine.created_at AS at
       FROM replies mine
       JOIN posts p ON p.id = mine.post_id
       JOIN people y ON y.id = p.author_id
       JOIN posts own ON own.author_id = mine.author_id AND own.scope = 'everyone' AND own.kind IN ('trouble', 'worry')
       JOIN replies help ON help.post_id = own.id AND help.author_id = p.author_id
       WHERE mine.author_id = ? AND p.author_id != mine.author_id AND p.scope = 'everyone' AND ${CONSULT}
         AND help.created_at < mine.created_at
       ORDER BY mine.created_at, mine.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `${text(row.name)}さんに、恩返しができた日`, at: text(row.at) } : null;
  },

  trusted: (db, personId) => {
    const rows = all(
      db,
      `SELECT p.author_id, p.scope, a.name, p.created_at AS at FROM posts p JOIN people a ON a.id = p.author_id
       WHERE p.author_id != ?
         AND (p.asked_person_id = ?
              OR EXISTS (SELECT 1 FROM post_passes x WHERE x.post_id = p.id AND (x.to_person_id = ? OR x.from_person_id = ?)))
       ORDER BY p.created_at, p.rowid`,
      personId,
      personId,
      personId,
      personId,
    );
    const seen = new Set<string>();
    for (const row of rows) {
      const author = text(row.author_id);
      if (seen.has(author)) {
        const who = row.scope === "everyone" ? `${text(row.name)}さん` : "同じ人";
        return { story: `${who}から、2回目の「お願いします」が届いた日`, at: text(row.at) };
      }
      seen.add(author);
    }
    return null;
  },

  thanks: (db, personId) => {
    const row = one(
      db,
      `SELECT a.name, t.created_at AS at FROM thanks t JOIN people a ON a.id = t.from_person_id
       WHERE t.to_person_id = ? AND t.from_person_id != t.to_person_id ORDER BY t.created_at, t.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `${text(row.name)}さんから、ありがとうが届いた日`, at: text(row.at) } : null;
  },

  pass: (db, personId) => {
    const [row] = resolvedPasses(db, personId);
    if (!row) return null;
    return { story: row.name ? `${text(row.name)}さんの相談を、つないで届けた日` : "つないだ相談に、答えが届いた日", at: text(row.at) };
  },

  // ありがとうは受け取る人だけのものなので、誰が誰に送ったかも、いつ送ったかも、回した人には見せない
  assist: (db, personId) => {
    const row = one(
      db,
      `SELECT 1 AS hit FROM post_passes x
       JOIN posts p ON p.id = x.post_id
       JOIN replies r ON r.post_id = p.id AND r.author_id = x.to_person_id
       JOIN thanks t ON t.to_person_id = x.to_person_id AND t.from_person_id = p.author_id AND t.created_at > x.created_at
       WHERE x.from_person_id = ? LIMIT 1`,
      personId,
    );
    return row ? { story: "つないだ先の人に、ありがとうが届いた", at: null } : null;
  },

  bridge: (db, personId) => {
    const rows = all(
      db,
      `SELECT me.label AS my_label, a.label AS their_label, a.name, r.created_at AS at
       FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = p.author_id JOIN people me ON me.id = r.author_id
       WHERE r.author_id = ? AND p.author_id != r.author_id AND p.scope = 'everyone' AND p.kind != 'notice'
       ORDER BY r.created_at, r.rowid`,
      personId,
    );
    for (const row of rows) {
      const mine = affiliationOf(text(row.my_label));
      const theirs = affiliationOf(text(row.their_label));
      if (differs(mine.grade, theirs.grade) || differs(mine.club, theirs.club)) {
        return { story: `${text(row.name)}さんの投稿に、返事をした日`, at: text(row.at) };
      }
    }
    return null;
  },

  relay: (db, personId) => {
    const posts = all(
      db,
      `SELECT p.id, p.author_id, p.asked_person_id, r.created_at AS at
       FROM posts p JOIN replies r ON r.post_id = p.id AND r.author_id = p.asked_person_id
       WHERE p.scope = 'everyone' AND EXISTS (SELECT 1 FROM post_passes x WHERE x.post_id = p.id)
       ORDER BY r.created_at, r.rowid`,
    );
    for (const post of posts) {
      const runners = new Set(all(db, "SELECT from_person_id AS id FROM post_passes WHERE post_id = ?", text(post.id)).map((row) => text(row.id)));
      runners.add(text(post.asked_person_id));
      runners.delete(text(post.author_id));
      if (runners.size >= 3 && (runners.has(personId) || post.author_id === personId)) {
        return { story: "みんなでつないで、相談が解決した日", at: text(post.at) };
      }
    }
    return null;
  },

  "seed-words": (db, personId) => {
    const row = one(
      db,
      `SELECT i.title, i.updated_at AS at FROM knowledge_contributors c JOIN knowledge_items i ON i.id = c.item_id
       WHERE c.person_id = ? AND c.state = 'ok' AND i.status = 'shared' ORDER BY i.created_at, i.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `「${text(row.title)}」が、校内の知恵になった日`, at: text(row.at) } : null;
  },

  "knowledge-helped": (db, personId) => {
    const [row] = likedItems(db, personId);
    return row ? { story: `「${text(row.title)}」に、いいねが届いた日`, at: text(row.at) } : null;
  },

  legend: (db, personId) => itemWithLikes(likedItems(db, personId), LEGEND_LIKES),

  timeless: (db, personId) => {
    const row = likedItems(db, personId).find((like) => Date.parse(text(like.at)) - Date.parse(text(like.item_at)) >= HALF_YEAR_DAYS * 86_400_000);
    return row ? { story: `「${text(row.title)}」に、時を超えていいねが届いた日`, at: text(row.at) } : null;
  },

  "note-helped": (db, personId) => {
    const row = one(
      db,
      `SELECT i.title, n.created_at AS at FROM knowledge_notes n JOIN knowledge_items i ON i.id = n.item_id
       WHERE n.author_id = ?
         AND (SELECT count(*) FROM knowledge_note_votes v WHERE v.note_id = n.id AND v.person_id != n.author_id) >= 2
       ORDER BY n.created_at, n.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `「${text(row.title)}」に書いた注釈が、役に立つと言われた日`, at: text(row.at) } : null;
  },

  "nice-fail": (db, personId) => sharedOfTopic(db, personId, "failure", (title) => `うまくいかなかった経験が「${title}」になった日`),

  "humble-master": fromLog("knowledge-fixed-after-review", "もらった意見を受けて、知恵を直した日"),

  "ask-courage": (db, personId) => {
    const row = one(
      db,
      `SELECT r.created_at AS at FROM posts p JOIN replies r ON r.post_id = p.id AND r.author_id != p.author_id
       WHERE p.author_id = ? AND p.asked_person_id IS NOT NULL ORDER BY r.created_at, r.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: "お願いしたら、返事が来た日", at: text(row.at) } : null;
  },

  "three-heads": (db, personId) => {
    const row = one(
      db,
      `SELECT p.id FROM posts p
       WHERE p.scope = 'everyone' AND ${CONSULT}
         AND (SELECT count(DISTINCT r.author_id) FROM replies r WHERE r.post_id = p.id AND r.author_id != p.author_id) >= 3
         AND (p.author_id = ? OR EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = ?))
       ORDER BY p.created_at, p.rowid LIMIT 1`,
      personId,
      personId,
    );
    return row ? { story: "1つの相談に、3人の言葉が集まった", at: null } : null;
  },

  "full-bloom": (db, personId, now) => {
    const bloom = bloomFor(countLeaves(db, now));
    if (bloom !== "満開" && bloom !== "夜桜") return null;
    const since = fiscalYearStart(now);
    const acted = one(
      db,
      `SELECT 1 AS hit WHERE
         EXISTS (SELECT 1 FROM posts WHERE author_id = ?1 AND created_at >= ?2 AND kind != 'notice' AND scope != 'self')
         OR EXISTS (SELECT 1 FROM replies WHERE author_id = ?1 AND created_at >= ?2)
         OR EXISTS (SELECT 1 FROM thanks WHERE from_person_id = ?1 AND created_at >= ?2)
         OR EXISTS (SELECT 1 FROM study_sessions WHERE person_id = ?1 AND finished_at >= ?2 AND completed = 1 AND is_demo = 0)
         OR EXISTS (SELECT 1 FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE l.person_id = ?1 AND p.created_at >= ?2)`,
      personId,
      since,
    );
    return acted ? { story: "桜が満開になった年に、葉を増やしていた", at: null } : null;
  },

  // 自習室は名前を出さない場所なので、誰と一緒だったかは書かない
  "same-desk": (db, personId) => {
    const row = one(
      db,
      `SELECT mine.finished_at AS at FROM study_sessions mine
       JOIN study_sessions other ON other.person_id != mine.person_id AND other.is_demo = 0 AND other.completed = 1
         AND other.started_at < mine.ends_at AND other.ends_at > mine.started_at
       WHERE mine.person_id = ? AND mine.is_demo = 0 AND mine.completed = 1
       ORDER BY mine.finished_at LIMIT 1`,
      personId,
    );
    return row ? { story: "自習室で、同じ時間に誰かと勉強を終えた日", at: text(row.at) } : null;
  },

  "walk-the-talk": (db, personId) => {
    const row = one(
      db,
      `SELECT g.created_at AS at FROM goal_posts g JOIN posts p ON p.id = g.post_id
       WHERE p.author_id = ? AND p.scope != 'self' ORDER BY g.created_at LIMIT 1`,
      personId,
    );
    return row ? { story: "頑張りたいことを乗り越えて、投稿した日", at: text(row.at) } : null;
  },

  "no-running": fromLog("goal-resumed", "止まっていた頑張りたいことに、もう一度取り組んだ日"),

  returned: (db, personId) => {
    const rows = all(
      db,
      `SELECT r.created_at AS at FROM replies r JOIN posts p ON p.id = r.post_id
       WHERE r.author_id = ? AND p.author_id != r.author_id AND p.scope = 'everyone' ORDER BY r.created_at, r.rowid`,
      personId,
    );
    for (let index = 1; index < rows.length; index += 1) {
      if (Date.parse(text(rows[index].at)) - Date.parse(text(rows[index - 1].at)) >= RETURN_GAP_MS) {
        return { story: "しばらくぶりに、誰かに返事をした日", at: text(rows[index].at) };
      }
    }
    return null;
  },

  "walking-archive": (db, personId) => itemWithLikes(likedItems(db, personId, "AND i.topic = 'procedure'"), LEGEND_LIKES),

  "copier-master": (db, personId) => {
    const marks = EQUIPMENT_CHANNELS.map(() => "?").join(", ");
    const row = one(
      db,
      `SELECT a.name, r.created_at AS at FROM replies r JOIN posts p ON p.id = r.post_id JOIN people a ON a.id = p.author_id
       WHERE ${PUBLIC_ANSWER} AND p.channel_id IN (${marks}) ORDER BY r.created_at, r.rowid LIMIT 1`,
      personId,
      ...EQUIPMENT_CHANNELS,
    );
    return row ? { story: `${text(row.name)}さんの機械の困りごとに、答えた日`, at: text(row.at) } : null;
  },

  "report-alchemist": (db, personId) => {
    const row = one(
      db,
      `SELECT p.created_at AS at FROM attachments f JOIN posts p ON p.id = f.post_id
       WHERE p.author_id = ? AND f.media_type = 'application/pdf' AND p.scope != 'self' ORDER BY p.created_at, p.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: "報告書から、投稿を作って送った日", at: text(row.at) } : null;
  },

  // 遅い時間の返事はほめない
  "faster-than-meeting": (db, personId) => {
    const rows = all(
      db,
      `SELECT p.created_at AS asked_at, r.created_at AS at FROM replies r JOIN posts p ON p.id = r.post_id
       WHERE p.scope = 'everyone' AND ${CONSULT} AND r.author_id != p.author_id AND (r.author_id = ? OR p.author_id = ?)
       ORDER BY r.created_at, r.rowid`,
      personId,
      personId,
    );
    const row = rows.find((reply) => {
      const at = text(reply.at);
      return dateInJapan(at) === dateInJapan(text(reply.asked_at)) && !isLateNight(new Date(at));
    });
    return row ? { story: "相談に、その日のうちに答えが届いた日", at: text(row.at) } : null;
  },

  "chalkboard-legend": (db, personId) => sharedOfTopic(db, personId, "tidy", (title) => `「${title}」が、校内の知恵になった日`),

  "thanks-millionaire": (db, personId) => {
    const row = one(db, "SELECT count(DISTINCT from_person_id) AS people FROM thanks WHERE to_person_id = ?1 AND from_person_id != ?1", personId);
    return Number(row?.people ?? 0) >= THANKS_PEOPLE ? { story: "たくさんの人から、ありがとうが届いた", at: null } : null;
  },

  // 分野はチャネルで数える。本文を読んで分けない
  "walking-search": (db, personId) => {
    const rows = all(db, `SELECT DISTINCT p.channel_id FROM replies r JOIN posts p ON p.id = r.post_id WHERE ${PUBLIC_ANSWER}`, personId);
    return rows.length >= TIMES ? { story: "違う場所で、次々に答えた", at: null } : null;
  },

  "pass-wizard": (db, personId) => {
    const resolved = resolvedPasses(db, personId);
    const ids = new Set<string>();
    for (const row of resolved) {
      ids.add(text(row.id));
      if (ids.size === TIMES) return { story: "パスした相談が、次々に解決した日", at: text(row.at) };
    }
    return null;
  },

  "unsung-hero": (db, personId) => {
    const row = one(
      db,
      `SELECT count(*) AS votes FROM knowledge_notes n JOIN knowledge_note_votes v ON v.note_id = n.id
       WHERE n.author_id = ?1 AND v.person_id != ?1`,
      personId,
    );
    return Number(row?.votes ?? 0) >= TIMES ? { story: "書いた注釈が、何度も役に立った", at: null } : null;
  },

  "first-post": (db, personId) => {
    const row = one(
      db,
      `SELECT created_at AS at FROM posts WHERE author_id = ? AND kind != 'notice' AND scope != 'self' ORDER BY created_at, rowid LIMIT 1`,
      personId,
    );
    return row ? { story: "初めて投稿した日", at: text(row.at) } : null;
  },

  "good-listener": fromLog("asked-back-post", "パートナーに聞き返されて、投稿まで進んだ日"),
  "walk-talk": fromLog("walk-post", "歩きながら話して、初めて投稿した日"),
  "ai-vs-human": fromLog("asked-human", "パートナーに言われて、本当に人に聞いた日"),

  boomerang: fromLog("found-own-post", "昔の自分の知恵に、助けられた日"),

  mentor: (db, personId) => {
    const row = one(
      db,
      `SELECT y.name, next.created_at AS at
       FROM replies mine
       JOIN posts p ON p.id = mine.post_id
       JOIN people y ON y.id = p.author_id
       JOIN replies next ON next.author_id = p.author_id AND next.created_at > mine.created_at
       JOIN posts q ON q.id = next.post_id
       WHERE mine.author_id = ? AND p.author_id != mine.author_id AND p.scope = 'everyone' AND ${CONSULT}
         AND q.scope = 'everyone' AND q.kind IN ('trouble', 'worry') AND q.author_id NOT IN (p.author_id, mine.author_id)
       ORDER BY next.created_at, next.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: `あなたが助けた${text(row.name)}さんが、別の人を助けた日`, at: text(row.at) } : null;
  },

  // 外れても困らない隠しトロフィーなので、公開の投稿の言葉が重なるかで見る
  "same-worry": (db, personId) => {
    const passes = all(
      db,
      `SELECT p.id, p.body, p.channel_id, x.to_person_id, x.created_at AS at
       FROM post_passes x JOIN posts p ON p.id = x.post_id
       WHERE x.from_person_id = ? AND p.scope = 'everyone' AND ${CONSULT} ORDER BY x.created_at, x.rowid`,
      personId,
    );
    for (const pass of passes) {
      const words = new Set(keywordsOf(text(pass.body)));
      const earlier = all(
        db,
        `SELECT p.body FROM posts p WHERE p.author_id = ? AND p.channel_id = ? AND p.scope = 'everyone' AND ${CONSULT} AND p.id != ? AND p.created_at < ?`,
        text(pass.to_person_id),
        text(pass.channel_id),
        text(pass.id),
        text(pass.at),
      );
      if (earlier.some((post) => keywordsOf(text(post.body)).some((word) => words.has(word)))) {
        return { story: "同じことで困っていた2人を、つないだ日", at: text(pass.at) };
      }
    }
    return null;
  },

  "both-ways": (db, personId) => {
    const row = one(
      db,
      `SELECT v.created_at AS at
       FROM knowledge_reviews v
       JOIN knowledge_items i ON i.id = v.item_id AND i.status = 'shared'
       JOIN knowledge_contributors c ON c.item_id = i.id AND c.state = 'ok'
       JOIN people liker ON liker.id = v.reviewer_id
       JOIN people maker ON maker.id = c.person_id
       WHERE v.verdict = 'like' AND (v.reviewer_id = ?1 OR c.person_id = ?1)
         AND (liker.role = 'student') != (maker.role = 'student')
       ORDER BY v.created_at, v.rowid LIMIT 1`,
      personId,
    );
    return row ? { story: "先生と生徒のあいだで、知恵にいいねが届いた日", at: text(row.at) } : null;
  },

  "four-seasons": (db, personId) => {
    const seasons = new Set(helpDates(db, personId).map((at) => seasonOf(new Date(at))));
    return seasons.size === 4 ? { story: "春夏秋冬、それぞれで誰かの役に立った", at: null } : null;
  },

  "undo-art": fromLog("repost-after-undo", "取り消して、送り直した日"),
  "rephrase-hero": fromLog("rephrase-accepted", "言い換えの提案を受け入れて送った日"),

  "under-sakura": (db, personId) => {
    const row = all(db, "SELECT created_at AS at FROM posts WHERE author_id = ? AND kind != 'notice' AND scope != 'self' ORDER BY created_at, rowid", personId).find(
      (post) => dateInJapan(text(post.at)).slice(5) === BLOOM_DAY,
    );
    return row ? { story: "開花の日に、投稿した", at: text(row.at) } : null;
  },

  "one-more-lap": fromLog("found-own-answer", "昔の自分の答えを、探して読んだ日"),

  "nurse-word": fromStance(isNurse, { replies: true, likes: false }, "保健室の先生から、返事が届いた日", ""),
  "grade-head-eyes": fromStance(isGradeHead, { replies: false, likes: true }, "", "学年主任の先生から、いいねが届いた"),
  "homeroom-reply": (db, personId, now) =>
    fromStance(isMyHomeroom(db, personId), { replies: true, likes: false }, "担任の先生から、返事が届いた日", "")(db, personId, now),
  "principal-office": fromStance(isManager, { replies: true, likes: true }, "管理職の先生から、返事が届いた日", "管理職の先生から、いいねが届いた"),
  "guidance-cheer": fromStance(isGuidance, { replies: true, likes: true }, "生徒指導の先生から、返事が届いた日", "生徒指導の先生から、いいねが届いた"),

  // 誰から・いつかは書かない（日時からも、めったに使わない人だと分かってしまう）
  "rare-word": (db, personId) => {
    const count = db.prepare(
      `SELECT (SELECT count(*) FROM posts WHERE author_id = ?1 AND created_at >= ?2 AND created_at < ?3)
            + (SELECT count(*) FROM replies WHERE author_id = ?1 AND created_at >= ?2 AND created_at < ?3 AND id != ?4) AS n`,
    );
    const rare = repliesToMe(db, personId).some((reply) => {
      const since = new Date(Date.parse(reply.at) - RARE_WINDOW_MS).toISOString();
      const row = count.get(reply.id, since, reply.at, reply.replyId) as { n: number };
      return row.n <= RARE_MAX;
    });
    return rare ? { story: "めずらしい一言が届いた", at: null } : null;
  },
};
