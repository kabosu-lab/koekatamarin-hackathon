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

// ---- 0-1j：桜の意味が見ただけで伝わるようにする（画面からも使う。サーバーの物は読まない） ----

/** 満開になる葉の数。bloomFor の「満開」と同じ */
export const FULL_BLOOM = 60;

/** 窓に添える一行。スクロールなしで全部見える長さにする（0-1d） */
export const SAKURA_STORY = "みんなのやり取りが葉になって、春の咲き方が決まります";

/** 満開まで、あと何枚か。満開を越えたら 0 */
export function leavesToFullBloom(leaves: number): number {
  return Math.max(0, FULL_BLOOM - Math.max(0, Math.floor(leaves)));
}

/** 満開までの進み（0〜1） */
export function bloomProgress(leaves: number): number {
  return Math.min(1, Math.max(0, leaves) / FULL_BLOOM);
}

/** 帯と窓に出す、満開までの言葉 */
export function bloomLine(leaves: number): string {
  const rest = leavesToFullBloom(leaves);
  if (rest > 0) return `満開まで あと${rest}枚`;
  return bloomFor(leaves) === "夜桜" ? "夜桜も見られそう" : "満開に届きました";
}

/** 春の見通しの説明（押すと出る3行） */
export function bloomExplanation(leaves: number): [string, string, string] {
  const count = Math.max(0, Math.floor(leaves));
  const rest = leavesToFullBloom(count);
  return [
    "投稿・返事・いいね・ありがとうが人に届くと、葉が1枚増えます。",
    `今の ${count} 枚だと、春は「${bloomFor(count)}」に咲きそうです。`,
    rest > 0 ? `あと ${rest} 枚で満開。控えめな年でも、木は枯れません。` : "満開に届きました。春をお楽しみに。",
  ];
}

/** 一度に飛ばす葉の数の上限。これを超えた分は「+N枚」の文字だけにする（設計書 §2-8） */
export const MAX_FLYING_LEAVES = 8;

/** 前に見た枚数と今の枚数から、増えた枚数と飛ばす葉の数を決める。初めて見るときは何も飛ばさない */
export function newLeaves(previous: number | null, current: number): { added: number; flying: number } {
  if (previous === null || !Number.isFinite(previous) || current <= previous) return { added: 0, flying: 0 };
  const added = Math.floor(current - previous);
  return { added, flying: Math.min(added, MAX_FLYING_LEAVES) };
}

/**
 * 葉が着く場所（樹冠の中、絵の幅と高さに対する %）。乱数を使わず番号から決める（サーバーと画面で同じ絵にする）。
 */
export function leafSlot(index: number): { x: number; y: number } {
  // 黄金角で散らすと、番号が続いても重なりにくい
  const angle = index * 2.39996;
  const radius = Math.sqrt(((index * 7) % 23) / 23);
  return {
    x: Math.round((50 + Math.cos(angle) * radius * 20) * 10) / 10,
    y: Math.round((30 + Math.sin(angle) * radius * 16) * 10) / 10,
  };
}

/** 「みんな」で最後に見た葉の数を残す場所（localStorage）。話す画面から届いたあとに開くと、差の分だけ葉が飛ぶ */
export const SEEN_LEAVES_KEY = "koekata_sakura_seen_leaves";
/** 春の見通しの説明を、一度自動で出したかの印（localStorage） */
export const EXPLAINED_KEY = "koekata_sakura_explained";
/** 同じ画面の中で人に届いたときに投げる知らせ（window の CustomEvent）。detail に { count } を入れる（省略で1枚） */
export const LEAF_EVENT = "koekata:leaf";

/** 樹冠の色。秋は夜でも沈みすぎない明るい色にし、木が弱って見えないようにする（0-1j(4)） */
export const CANOPY: Record<Season, string[]> = {
  haru: ["#f7c6d3", "#f3b0c3", "#fbdbe3"],
  natsu: ["#6fae6a", "#5c9c5c", "#86c07c"],
  aki: ["#f4b350", "#ee9a4c", "#f8cf6e"],
  fuyu: [],
};

/** 春の花の影の濃さと数。咲き方が大きいほど濃く、たくさん */
export function bloomShadow(leaves: number): { opacity: number; count: number } {
  const bloom = bloomFor(leaves);
  if (bloom === "夜桜") return { opacity: 0.5, count: 7 };
  if (bloom === "満開") return { opacity: 0.42, count: 7 };
  if (bloom === "きれい") return { opacity: 0.3, count: 5 };
  return { opacity: 0.2, count: 3 };
}

/** 動画用の早回しで、葉を1枚ずつ集める間隔（ms、設計書 §2-8） */
export const FAST_FORWARD_STEP_MS = 40;

/** 早回しで見せる葉の数の並び（start から満開まで） */
export function fastForwardCounts(start = 0): number[] {
  const from = Math.max(0, Math.min(FULL_BLOOM, Math.floor(start)));
  return Array.from({ length: FULL_BLOOM - from + 1 }, (_, i) => from + i);
}

/** 色の明るさ（相対輝度、0〜1）。秋の色が暗すぎないかを確かめるのに使う */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
