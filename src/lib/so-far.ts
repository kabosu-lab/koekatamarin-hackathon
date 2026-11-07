import type { DatabaseSync } from "node:sqlite";
import { countContributions, getAvatar } from "./avatar";
import { companionImage } from "./companion-art";
import { parseTerm, termIdOf } from "./portfolio";
import { listRibbons } from "./ribbons";
import { fiscalYearStart } from "./sakura";

/**
 * 0-2b 第3段：「これまで」のインフォグラフィックの材料。本人のものだけで、Claude は呼ばない。
 * 人と比べる数（順位、学校の中の割合、連続の記録）は作らない。
 */
export type SoFarStory = {
  /** 投稿・日報・返信・ありがとうがすべて 0 の人。②〜⑤を「はじまりの日」1場面にする */
  empty: boolean;
  /** 少ない人（5 未満）。升を4週に縮める */
  few: boolean;
  role: "teacher" | "admin" | "student";
  today: string;
  /** 本人の最初の投稿か日報の日（日本の日付） */
  firstDate: string | null;
  counts: {
    posts: number;
    comments: number;
    cheers: number;
    goals: number;
    assists: number;
    thanks: number;
  };
  /** この学期の、何かが人に届いた日（post_likes は時刻がないので入れない） */
  reachedDays: string[];
  /** 生徒だけ：一緒に勉強した日 */
  studyDays: string[];
  termStart: string;
  /** つながった人。隠している人は出さない。やり取りの多い順に最大12人（0-3h） */
  people: Connection[];
  morePeople: number;
  /** この年度に自分が足した葉（みんなの桜の数え方と同じ材料のうち、自分の分） */
  leaves: number;
  family: string | null;
  stage: number;
  image: string;
  /** パートナーのこれまでの姿（古い順、最後が今の姿。最大4つ） */
  stageImages: string[];
  /** この学期にもらったトロフィーの名前 */
  trophies: string[];
  /** 人からの一言（最新2件） */
  words: { from: string; text: string }[];
};

const MAX_PEOPLE = 12;

/** やり取りの種類（名札に出す、事実の数だけ） */
export const CONNECTION_KINDS = ["thanksGot", "thanksSent", "repliesGot", "repliesSent", "reportWords", "passed"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** つながった人。weight はやり取りの回数の合計（名前の大きさ） */
export type Connection = {
  id: string;
  name: string;
  /** 肩書（表示名の括弧に出しているもの） */
  label: string;
  weight: number;
  facts: { kind: ConnectionKind; count: number }[];
};

const japanDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(iso));

export function getSoFar(db: DatabaseSync, personId: string, now: Date): SoFarStory {
  const person = db.prepare("SELECT role FROM people WHERE id = ?").get(personId) as { role: SoFarStory["role"] } | undefined;
  const role = person?.role ?? "teacher";
  const all = <T>(sql: string, ...args: string[]) => db.prepare(sql).all(...args) as T[];
  const term = parseTerm(termIdOf(now))!;
  const contributions = countContributions(db, personId);
  const counts = {
    posts: contributions.posts,
    comments: contributions.comments,
    cheers: contributions.cheers,
    goals: contributions.goals,
    assists: contributions.assists,
    thanks: contributions.thanksReceived,
  };

  const reports = all<{ date: string; created_at: string }>("SELECT date, created_at FROM daily_reports WHERE person_id = ?", personId);
  const thanksSent = all<{ at: string }>("SELECT created_at AS at FROM thanks WHERE from_person_id = ?", personId);
  const activity = counts.posts + counts.comments + counts.thanks + reports.length + thanksSent.length;
  const empty = counts.posts + reports.length + counts.comments + counts.thanks + thanksSent.length === 0;

  // はじまり：最初の投稿か日報
  const firsts = [
    ...all<{ at: string }>("SELECT min(created_at) AS at FROM posts WHERE author_id = ? AND kind != 'notice'", personId),
    ...all<{ at: string }>("SELECT min(created_at) AS at FROM daily_reports WHERE person_id = ?", personId),
  ]
    .map((row) => row.at)
    .filter((at): at is string => typeof at === "string")
    .sort();
  const firstDate = firsts.length > 0 ? japanDay(firsts[0]) : null;

  // 届けた日の点（この学期）
  const reached = new Set<string>();
  const inTerm = (iso: string) => iso >= term.start && iso < term.end && iso <= now.toISOString();
  for (const row of [
    ...all<{ at: string }>("SELECT created_at AS at FROM posts WHERE author_id = ? AND kind != 'notice'", personId),
    ...all<{ at: string }>("SELECT created_at AS at FROM replies WHERE author_id = ?", personId),
    ...thanksSent,
  ]) {
    if (inTerm(row.at)) reached.add(japanDay(row.at));
  }
  const termStartDay = japanDay(term.start);
  const today = japanDay(now.toISOString());
  for (const report of reports) {
    if (report.date >= termStartDay && report.date <= today) reached.add(report.date);
  }
  const studyDays =
    role === "student"
      ? [
          ...new Set(
            all<{ at: string }>("SELECT started_at AS at FROM study_sessions WHERE person_id = ? AND completed = 1", personId)
              .filter((row) => inTerm(row.at))
              .map((row) => japanDay(row.at)),
          ),
        ].sort()
      : [];

  // つながりの線：やり取りした相手。隠している人と自分は出さない
  const hidden = new Set(
    all<{ id: string }>("SELECT hidden_person_id AS id FROM hidden_people WHERE person_id = ?", personId).map((r) => r.id),
  );
  // 0-3h：つながり（ワードクラウド）。人ごとに、やり取りの種類と回数を数える。
  // 生徒の画面では、職員室（先生だけのチャネル）と、自分だけ・管理職だけの投稿の上のやり取りは数えず、
  // 回しただけ（相手が何もしていない）の先生も出さない。先生の画面は本人のやり取りを見るだけなので、全部数える
  const open =
    role === "student"
      ? `coalesce((SELECT audience FROM channels c WHERE c.id = p.channel_id), 'everyone') != 'staff' AND p.scope IN ('everyone', 'person')`
      : "1 = 1";
  const tally = (sql: string) => all<{ id: string; n: number }>(sql, personId);
  const kinds: [ConnectionKind, { id: string; n: number }[]][] = [
    ["thanksGot", tally("SELECT from_person_id AS id, count(*) AS n FROM thanks WHERE to_person_id = ?1 GROUP BY from_person_id")],
    ["thanksSent", tally("SELECT to_person_id AS id, count(*) AS n FROM thanks WHERE from_person_id = ?1 GROUP BY to_person_id")],
    [
      "repliesGot",
      tally(`SELECT r.author_id AS id, count(*) AS n FROM replies r JOIN posts p ON p.id = r.post_id WHERE p.author_id = ?1 AND ${open} GROUP BY r.author_id`),
    ],
    [
      "repliesSent",
      tally(`SELECT p.author_id AS id, count(*) AS n FROM replies r JOIN posts p ON p.id = r.post_id WHERE r.author_id = ?1 AND ${open} GROUP BY p.author_id`),
    ],
    [
      "reportWords",
      tally(
        "SELECT x.from_person_id AS id, count(*) AS n FROM report_responses x JOIN daily_reports d ON d.id = x.report_id WHERE d.person_id = ?1 GROUP BY x.from_person_id",
      ),
    ],
    ["passed", tally("SELECT to_person_id AS id, count(*) AS n FROM post_passes WHERE from_person_id = ?1 GROUP BY to_person_id")],
  ];
  const everyone = new Map(
    all<{ id: string; name: string; role: SoFarStory["role"]; label: string }>("SELECT id, name, role, label FROM people").map((p) => [p.id, p]),
  );
  const names = new Map([...everyone.values()].map((p) => [p.id, p.name]));
  const byPerson = new Map<string, Partial<Record<ConnectionKind, number>>>();
  for (const [kind, rows] of kinds) {
    for (const row of rows) {
      const other = everyone.get(row.id);
      if (!other || row.id === personId || hidden.has(row.id) || row.n <= 0) continue;
      if (role === "student" && other.role !== "student" && kind === "passed") continue;
      const facts = byPerson.get(row.id) ?? {};
      facts[kind] = (facts[kind] ?? 0) + row.n;
      byPerson.set(row.id, facts);
    }
  }
  const ordered = [...byPerson.entries()]
    .map(([id, facts]) => {
      const other = everyone.get(id)!;
      const list = CONNECTION_KINDS.filter((kind) => (facts[kind] ?? 0) > 0).map((kind) => ({ kind, count: facts[kind]! }));
      return {
        id,
        name: other.name,
        label: other.label,
        weight: list.reduce((sum, fact) => sum + fact.count, 0),
        facts: list,
      };
    })
    .filter((p) => p.name !== "" && p.weight > 0)
    .sort((x, y) => y.weight - x.weight || x.name.localeCompare(y.name, "ja"));

  // 桜とパートナー：この年度に自分が足した葉
  const yearStart = fiscalYearStart(now);
  const one = (sql: string) => (db.prepare(sql).get(personId, yearStart) as { count: number }).count;
  const leaves =
    one("SELECT count(*) AS count FROM posts WHERE author_id = ? AND created_at >= ? AND kind != 'notice' AND scope != 'self'") +
    one("SELECT count(*) AS count FROM replies WHERE author_id = ? AND created_at >= ?") +
    one("SELECT count(*) AS count FROM thanks WHERE from_person_id = ? AND created_at >= ?") +
    one("SELECT count(*) AS count FROM study_sessions WHERE person_id = ? AND finished_at >= ? AND completed = 1 AND is_demo = 0") +
    one("SELECT count(*) AS count FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE l.person_id = ? AND p.created_at >= ?");
  const avatar = getAvatar(db, personId);
  const earned = new Set(
    all<{ id: string }>("SELECT ribbon_id AS id FROM person_ribbons WHERE person_id = ? AND earned_at >= ?", personId, term.start).map(
      (r) => r.id,
    ),
  );
  const trophies = listRibbons(db, personId)
    .filter((ribbon) => earned.has(ribbon.id))
    .map((ribbon) => ribbon.name);

  // 一言：人からの言葉で閉じる（AI の褒め言葉は出さない）。先生は返す側なので、ありがとうだけ
  const words = [
    ...all<{ from_id: string; text: string; at: string }>(
      "SELECT from_person_id AS from_id, message AS text, created_at AS at FROM thanks WHERE to_person_id = ?",
      personId,
    ),
    ...(role === "student"
      ? all<{ from_id: string; text: string; at: string }>(
          `SELECT x.from_person_id AS from_id, x.text, x.created_at AS at FROM report_responses x
           JOIN daily_reports d ON d.id = x.report_id WHERE d.person_id = ?`,
          personId,
        )
      : []),
  ]
    .filter((word) => !hidden.has(word.from_id))
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 2)
    .map((word) => ({ from: names.get(word.from_id) ?? "", text: word.text }));

  return {
    empty,
    few: activity < 5,
    role,
    today,
    firstDate,
    counts,
    reachedDays: [...reached].sort(),
    studyDays,
    termStart: termStartDay,
    people: ordered.slice(0, MAX_PEOPLE),
    morePeople: Math.max(0, ordered.length - MAX_PEOPLE),
    leaves,
    family: avatar.family,
    stage: avatar.stage,
    image: avatar.image,
    stageImages: avatar.family
      ? [...Array.from({ length: Math.max(0, avatar.stage - 1) }, (_, i) => companionImage(avatar.family!, i + 1)).slice(-3), avatar.image]
      : [],
    trophies,
    words,
  };
}
