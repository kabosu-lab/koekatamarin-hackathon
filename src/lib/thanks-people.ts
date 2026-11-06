import type { DatabaseSync } from "node:sqlite";
import { listHiddenIds } from "./hidden-people";
import { readThanksKind, type ThanksKind } from "./thanks-kind";

/**
 * サンクスカードの送り先を探す（0-2j）。一覧から選ばせず、最近やりとりした人と、打って絞り込む欄で探す。
 * どれも自分と、自分が「しばらく出さない」にした人は出さない。
 */
export type ThanksPerson = { id: string; name: string; label: string };

const RECENT_LIMIT = 5;
const SEARCH_LIMIT = 8;

/** 最近やりとりした人。返事をくれた・返事をした・ありがとうを送り合った・つないだ・聞いてみるの相手 */
export function listRecentPartners(db: DatabaseSync, viewerId: string, limit = RECENT_LIMIT): ThanksPerson[] {
  const rows = db
    .prepare(
      `SELECT x.person_id AS id, p.name, p.label, MAX(x.at) AS last_at FROM (
         SELECT to_person_id AS person_id, created_at AS at FROM thanks WHERE from_person_id = :me
         UNION ALL SELECT from_person_id, created_at FROM thanks WHERE to_person_id = :me
         UNION ALL SELECT r.author_id, r.created_at FROM replies r JOIN posts po ON po.id = r.post_id WHERE po.author_id = :me
         UNION ALL SELECT po.author_id, r.created_at FROM replies r JOIN posts po ON po.id = r.post_id WHERE r.author_id = :me
         UNION ALL SELECT to_person_id, created_at FROM post_passes WHERE from_person_id = :me
         UNION ALL SELECT from_person_id, created_at FROM post_passes WHERE to_person_id = :me
         UNION ALL SELECT asked_person_id, created_at FROM posts WHERE author_id = :me AND asked_person_id IS NOT NULL
         UNION ALL SELECT author_id, created_at FROM posts WHERE asked_person_id = :me
       ) x JOIN people p ON p.id = x.person_id
       WHERE x.person_id <> :me
       GROUP BY x.person_id
       ORDER BY last_at DESC, p.rowid`,
    )
    .all({ me: viewerId }) as { id: string; name: string; label: string }[];
  const hidden = listHiddenIds(db, viewerId);
  return rows
    .filter((row) => !hidden.has(row.id))
    .slice(0, limit)
    .map(({ id, name, label }) => ({ id, name, label }));
}

/** 比べやすくする。全角半角をそろえ、空白を除き、呼び方（先生・さん など）を外す */
function plain(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/(先生|せんせい|さん|くん|君|ちゃん)$/, "")
    .toLowerCase();
}

function candidates(db: DatabaseSync, viewerId: string): ThanksPerson[] {
  const hidden = listHiddenIds(db, viewerId);
  return (db.prepare("SELECT id, name, label FROM people ORDER BY rowid").all() as ThanksPerson[])
    .filter((p) => p.id !== viewerId && !hidden.has(p.id))
    .map(({ id, name, label }) => ({ id, name, label }));
}

/** 名前の一部か、学年・クラス・教科・部活（label）の一部で絞る。空なら誰も出さない（全員の一覧は作らない） */
export function searchThanksPeople(db: DatabaseSync, viewerId: string, query: string, limit = SEARCH_LIMIT): ThanksPerson[] {
  const q = plain(query);
  if (q === "") return [];
  return candidates(db, viewerId)
    .filter((p) => plain(p.name).includes(q) || plain(p.label).includes(q))
    .slice(0, limit);
}

export type ThanksDraft = {
  /** 1人に決まったときだけ入る */
  to: ThanksPerson | null;
  /** 名前が同じ人が何人かいたとき（どれか1人を押してもらう） */
  choices: ThanksPerson[];
  message: string;
  kind: ThanksKind;
};

const HONORIFIC = "(?:先生|せんせい|さん|くん|君|ちゃん)?";
const ENDING =
  /(?:って|と|を)?(?:伝えたい|言いたい|いいたい|送りたい|届けたい|伝えて|言って|送って|届けて)(?:ほしい|欲しい|ください|な|です|んだけど|んだ|の)*[。！!、…\s]*$/;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 話した言葉からサンクスカードの下書きを作る（例：「野田先生に、3Dプリンターを教えてくれてありがとうって伝えたい」）。
 * 名前が見つからなければ null。送るのは本人がカードで確かめてから。
 */
export function draftThanksFromWords(db: DatabaseSync, viewerId: string, words: string): ThanksDraft | null {
  const text = words.normalize("NFKC").trim();
  if (text === "") return null;
  const people = candidates(db, viewerId);
  // 姓名つづき・姓・名の、いちばん長く当たった呼び方を使う
  let best = "";
  let matched: ThanksPerson[] = [];
  for (const person of people) {
    const parts = person.name.normalize("NFKC").split(/\s+/).filter(Boolean);
    const keys = [parts.join(""), person.name.normalize("NFKC"), ...parts];
    for (const key of keys) {
      // 1文字の名（「翔」など）は、ほかの言葉に紛れやすいので使わない
      if (key.length < 2) continue;
      if (!text.includes(key)) continue;
      if (key.length > best.length) {
        best = key;
        matched = [person];
      } else if (key.length === best.length && !matched.some((m) => m.id === person.id)) {
        matched.push(person);
      }
    }
  }
  if (matched.length === 0) return null;

  const message = text
    .replace(new RegExp(`^.*?${escape(best)}${HONORIFIC}(?:に|へ)[、,]?\\s*`), "")
    .replace(ENDING, "")
    .trim();
  const kind = readThanksKind(message || text);
  return {
    to: matched.length === 1 ? matched[0] : null,
    choices: matched.length === 1 ? [] : matched,
    message: message || defaultWords(kind),
    kind,
  };
}

function defaultWords(kind: ThanksKind): string {
  if (kind === "effort") return "頑張ってたね！";
  if (kind === "congrats") return "おめでとう！";
  return "ありがとう！";
}

/** 受信箱の「届いた返事」の、返事をくれた人。返事の一覧の形は変えずに、ありがとうの入口のためだけに引く */
export function replyAuthors(db: DatabaseSync, replyIds: string[]): Map<string, ThanksPerson> {
  if (replyIds.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT r.id AS reply_id, p.id, p.name, p.label FROM replies r JOIN people p ON p.id = r.author_id
       WHERE r.id IN (${replyIds.map(() => "?").join(", ")})`,
    )
    .all(...replyIds) as { reply_id: string; id: string; name: string; label: string }[];
  return new Map(rows.map((row) => [row.reply_id, { id: row.id, name: row.name, label: row.label }]));
}
