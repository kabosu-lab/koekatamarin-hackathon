import type { DatabaseSync } from "node:sqlite";

export type Season = "haru" | "natsu" | "aki" | "fuyu";

export type SakuraView = {
  season: Season;
  leaves: number;
  bloom: "控えめ" | "きれい" | "満開" | "夜桜";
  message: string;
};

const SEASONS: readonly Season[] = ["haru", "natsu", "aki", "fuyu"];

export function seasonOf(now: Date): Season {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "numeric" }).format(now));
  if (month >= 3 && month <= 5) return "haru";
  if (month >= 6 && month <= 8) return "natsu";
  if (month >= 9 && month <= 11) return "aki";
  return "fuyu";
}

export function parseSeason(value: unknown): Season | null {
  return SEASONS.find((s) => s === value) ?? null;
}

/** 今の年度の始まり（4月1日、日本時間）。 */
export function fiscalYearStart(now: Date): string {
  const [year, month] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return new Date(`${month >= 4 ? year : year - 1}-04-01T00:00:00+09:00`).toISOString();
}

/** 葉になるのは人に届いたやり取りだけ。Claude と話すだけでは増えない。年度（4月）で数え直す。 */
export function countLeaves(db: DatabaseSync, now: Date): number {
  return countLeavesSince(db, fiscalYearStart(now));
}

/** この7日で増えた葉。季節が変わるまで絵は大きく変わらないので、言葉で育ち具合を補う。 */
export function leavesThisWeek(db: DatabaseSync, now: Date): number {
  return countLeavesSince(db, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
}

function countLeavesSince(db: DatabaseSync, since: string): number {
  const one = (sql: string) => (db.prepare(sql).get(since) as { count: number }).count;
  return (
    // 自分だけの投稿は、人に届いていないので葉にならない
    one("SELECT count(*) AS count FROM posts WHERE created_at >= ? AND kind != 'notice' AND scope != 'self'") +
    one("SELECT count(*) AS count FROM replies WHERE created_at >= ?") +
    one("SELECT count(*) AS count FROM thanks WHERE created_at >= ?") +
    one("SELECT count(*) AS count FROM study_sessions WHERE finished_at >= ? AND completed = 1 AND is_demo = 0") +
    // いいねには日時がないので、対象の投稿の日時で数える
    one(`SELECT count(*) AS count FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE p.created_at >= ?`)
  );
}

/** 控えめな年でも枯れない。責めずに、また次の一年が始まる。 */
export function bloomFor(leaves: number): SakuraView["bloom"] {
  if (leaves >= 150) return "夜桜";
  if (leaves >= 60) return "満開";
  if (leaves >= 20) return "きれい";
  return "控えめ";
}

const FORECAST: Record<SakuraView["bloom"], string> = {
  控えめ: "小さなつぼみが、静かに春を待っています。",
  きれい: "やり取りが葉になって、きれいに咲きそうです。",
  満開: "みんなのやり取りで、満開になりそうです。",
  夜桜: "期待を超える盛り上がりです。今年は夜桜も見られそう。",
};

const BLOOMED: Record<SakuraView["bloom"], string> = {
  控えめ: "今年の桜が、控えめに咲きました。また次の一年が始まります。",
  きれい: "今年の桜が、きれいに咲きました。",
  満開: "今年の桜が、満開になりました。みんなのやり取りのおかげです。",
  夜桜: "今年の桜が、期待を超えて満開です。夜桜も見られます。",
};

const BY_SEASON: Record<Exclude<Season, "haru">, string> = {
  natsu: "夏の葉が茂っています。",
  aki: "葉が色づいてきました。",
  fuyu: "冬の木が、芽を蓄えています。",
};

export function getSakura(db: DatabaseSync, now: Date, season: Season = seasonOf(now)): SakuraView {
  const leaves = countLeaves(db, now);
  const bloom = bloomFor(leaves);
  const message = season === "haru" ? BLOOMED[bloom] : `${BY_SEASON[season]}${FORECAST[bloom]}`;
  return { season, leaves, bloom, message };
}

export type TimeOfDay = "morning" | "day" | "evening" | "night";

/** 朝昼夕夜の空。 */
export function timeOfDay(now: Date): TimeOfDay {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}

export function isBloomingSeason(season: Season): boolean {
  return season === "haru";
}
