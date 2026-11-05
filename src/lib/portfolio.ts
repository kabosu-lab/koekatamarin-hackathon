import type { DatabaseSync } from "node:sqlite";
import type { ClaudeClient } from "./claude/types";
import { japanDate } from "./daily";
import { MAX_BODY_LENGTH } from "./destination/types";
import { collectMaterial, lookbackSystemPrompt, writeLookback } from "./lookback";
import { listRibbons } from "./ribbons";

/**
 * 学期ごとのポートフォリオ。本人だけのもの。
 * 日報と日記はすでにたまっているので写さず、学期の範囲で引く。足したものは印だけを持ち、読むときに元を確かめる。
 * Teams へ送る処理はここに置かない。下書きを作るだけで、送るのは本人が確かめたあとの /api/publish（getDestination を通る）。
 */
const MAX_TERMS = 12;
const MAX_REFLECTION_LENGTH = 4000;
const MAX_PICKS = 50;

export type Term = { id: string; label: string; start: string; end: string };
export type PortfolioKind = "post" | "thanks" | "knowledge" | "trophy";

/** 数、いいね、順位、確認の印は持たせない。人と比べる材料も、本人に見せない印も画面へ渡さないため。 */
export type PortfolioEntry = {
  kind: PortfolioKind;
  ref: string;
  label: string;
  text: string;
  detail: string | null;
  date: string;
  /** Teams へ届ける候補にしてよいか */
  shareable: boolean;
};
export type PortfolioDay = { id: string; date: string; items: { id: string; text: string }[] };
export type Portfolio = {
  term: Term;
  days: PortfolioDay[];
  reflection: string | null;
  added: PortfolioEntry[];
  candidates: PortfolioEntry[];
};
export type PortfolioOptions = { rewards: boolean; now?: Date };

type Outcome = { status: number; body: Record<string, unknown> };

/** 学期は lookback.ts の periodStart と同じ区切り（4・9・1 月から）。年は年度で数える。 */
export function termIdOf(at: Date): string {
  const [year, month] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(at)
    .split("-")
    .map(Number);
  const schoolYear = month >= 4 ? year : year - 1;
  const number = month >= 9 ? 2 : month >= 4 ? 1 : 3;
  return `${schoolYear}-${number}`;
}

const japanStart = (date: string) => new Date(`${date}T00:00:00+09:00`).toISOString();

export function parseTerm(id: unknown): Term | null {
  const match = typeof id === "string" ? id.match(/^(\d{4})-([123])$/) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const number = Number(match[2]);
  const [start, end] =
    number === 1
      ? [`${year}-04-01`, `${year}-09-01`]
      : number === 2
        ? [`${year}-09-01`, `${year + 1}-01-01`]
        : [`${year + 1}-01-01`, `${year + 1}-04-01`];
  return { id: `${year}-${number}`, label: `${year}年度 ${number}学期`, start: japanStart(start), end: japanStart(end) };
}

function previousTerm(term: Term): Term {
  const [year, number] = term.id.split("-").map(Number);
  return parseTerm(number > 1 ? `${year}-${number - 1}` : `${year - 1}-3`) as Term;
}

/** 選べる学期。新しい順で、今の学期から、本人の記録がある最初の学期まで。先の学期は出さない。 */
export function listTerms(db: DatabaseSync, personId: string, now: Date): Term[] {
  const { at: earliest } = db
    .prepare(
      `SELECT MIN(at) AS at FROM (
         SELECT created_at AS at FROM daily_reports WHERE person_id = ?
         UNION ALL SELECT created_at FROM posts WHERE author_id = ?
         UNION ALL SELECT created_at FROM thanks WHERE to_person_id = ?
       )`,
    )
    .get(personId, personId, personId) as { at: string | null };
  const terms: Term[] = [];
  let term = parseTerm(termIdOf(now)) as Term;
  while (terms.length < MAX_TERMS) {
    terms.push(term);
    if (earliest === null || earliest >= term.start) break;
    term = previousTerm(term);
  }
  return terms;
}

function listDays(db: DatabaseSync, personId: string, term: Term): PortfolioDay[] {
  const reports = db
    .prepare("SELECT id, date FROM daily_reports WHERE person_id = ? AND created_at >= ? AND created_at < ? ORDER BY date DESC")
    .all(personId, term.start, term.end) as { id: string; date: string }[];
  const items = db.prepare("SELECT id, text FROM report_items WHERE report_id = ? ORDER BY position");
  return reports.map((report) => ({
    id: report.id,
    date: report.date,
    items: (items.all(report.id) as { id: string; text: string }[]).map(({ id, text }) => ({ id, text })),
  }));
}

const inTerm = (at: string, term: Term) => at >= term.start && at < term.end;
const dateOf = (at: string) => japanDate(new Date(at));

/** その学期に本人のものとして足せるもの。ここにないものは足せない。 */
function listEntries(db: DatabaseSync, personId: string, term: Term, rewards: boolean): PortfolioEntry[] {
  const posts = db
    .prepare(
      `SELECT p.id, p.body, p.created_at, p.scope, c.name, c.audience FROM posts p
       JOIN channels c ON c.id = p.channel_id
       WHERE p.author_id = ? AND p.created_at >= ? AND p.created_at < ?
       ORDER BY p.created_at DESC, p.rowid DESC`,
    )
    .all(personId, term.start, term.end) as { id: string; body: string; created_at: string; scope: string; name: string; audience: string }[];
  const thanks = db
    .prepare(
      `SELECT t.id, t.message, t.created_at, p.name FROM thanks t
       JOIN people p ON p.id = t.from_person_id
       WHERE t.to_person_id = ? AND t.created_at >= ? AND t.created_at < ?
       ORDER BY t.created_at DESC, t.rowid DESC`,
    )
    .all(personId, term.start, term.end) as { id: string; message: string; created_at: string; name: string }[];
  // 確認中の知恵と、本人が名前と言葉を外した知恵は、本人の知恵として扱わない
  const knowledge = db
    .prepare(
      `SELECT k.id, k.title, k.body, k.created_at, c.audience FROM knowledge_items k
       JOIN knowledge_contributors w ON w.item_id = k.id AND w.person_id = ? AND w.state = 'ok'
       JOIN posts s ON s.id = k.source_post_id
       JOIN channels c ON c.id = s.channel_id
       WHERE k.status = 'shared' AND k.created_at >= ? AND k.created_at < ?
       ORDER BY k.created_at DESC, k.rowid DESC`,
    )
    .all(personId, term.start, term.end) as { id: string; title: string; body: string; created_at: string; audience: string }[];

  const entries: PortfolioEntry[] = [
    ...posts.map((post) => ({
      kind: "post" as const,
      ref: post.id,
      label: post.scope === "everyone" ? `投稿（${post.name}）` : `投稿（${post.name}、範囲を絞ったもの）`,
      text: post.body,
      detail: null,
      date: dateOf(post.created_at),
      // 全員に見えている投稿だけ。絞った投稿や教職員だけのチャネルの投稿を、本人の操作ひとつで広げない
      shareable: post.scope === "everyone" && post.audience === "everyone",
    })),
    ...thanks.map((card) => ({
      kind: "thanks" as const,
      ref: card.id,
      label: `ありがとう（${card.name}さんから）`,
      text: card.message,
      detail: null,
      date: dateOf(card.created_at),
      // 本人だけに届いた、相手の言葉。相手は校内に出すことを認めていない
      shareable: false,
    })),
    ...knowledge.map((item) => ({
      kind: "knowledge" as const,
      ref: item.id,
      label: "校内の知恵",
      text: item.title,
      detail: item.body,
      date: dateOf(item.created_at),
      shareable: item.audience === "everyone",
    })),
  ];
  // 報酬を隠している人には、ここでも出さない
  if (!rewards) return entries;

  const earned = db.prepare("SELECT ribbon_id, COALESCE(story_at, earned_at) AS at FROM person_ribbons WHERE person_id = ?").all(personId) as {
    ribbon_id: string;
    at: string;
  }[];
  const when = new Map(earned.map((row) => [row.ribbon_id, row.at]));
  const trophies = listRibbons(db, personId).flatMap((ribbon): PortfolioEntry[] => {
    const at = when.get(ribbon.id);
    if (!at || !inTerm(at, term)) return [];
    return [
      {
        kind: "trophy",
        ref: ribbon.id,
        label: "トロフィー",
        text: ribbon.name,
        detail: ribbon.story,
        date: dateOf(at),
        // 回数を条件にするものなど、プロフィールに出せないものは Teams へも出さない
        shareable: !ribbon.selfOnly,
      },
    ];
  });
  return [...entries, ...trophies];
}

export function getPortfolio(db: DatabaseSync, personId: string, term: Term, { rewards }: PortfolioOptions): Portfolio {
  const picked = new Set(
    (db.prepare("SELECT kind, ref FROM portfolio_items WHERE person_id = ? AND term = ?").all(personId, term.id) as { kind: string; ref: string }[]).map(
      (row) => `${row.kind}:${row.ref}`,
    ),
  );
  const entries = listEntries(db, personId, term, rewards);
  const isAdded = (entry: PortfolioEntry) => picked.has(`${entry.kind}:${entry.ref}`);
  const reflection = db.prepare("SELECT text FROM portfolio_reflections WHERE person_id = ? AND term = ?").get(personId, term.id) as
    | { text: string }
    | undefined;
  return {
    term,
    days: listDays(db, personId, term),
    reflection: reflection?.text ?? null,
    added: entries.filter(isAdded),
    candidates: entries.filter((entry) => !isAdded(entry)),
  };
}

export const portfolioSystemPrompt = `${lookbackSystemPrompt}

ここでは学期のポートフォリオに本人が残すための文章を書きます。次の決まりを、上の決まりより優先してください。

- 結果や評価を断定しない。「成長した」「力がついた」「優れている」と決めつけず、「○○に取り組んでいました」「○○と書いていました」のように、材料にあることをそのまま伝える
- 成績、順位、点数、回数で測らない。人と比べない
- 本人の性格や気持ちを推し量って書かない`;

/** 本人が見て、残すかを決めるための文章を作る。ここでは保存しない。相棒との話は材料に入れない。 */
async function reflect(claude: ClaudeClient, db: DatabaseSync, personId: string, term: Term, options: PortfolioOptions): Promise<Outcome> {
  const { added } = getPortfolio(db, personId, term, options);
  const chosen = added.flatMap((entry) =>
    entry.kind === "knowledge" ? [`知恵：${entry.text}`] : entry.kind === "trophy" ? [`トロフィー：${entry.text}`] : [],
  );
  try {
    const result = await writeLookback(claude, [...collectMaterial(db, personId, term.start, term.end), ...chosen], portfolioSystemPrompt);
    return { status: 200, body: result };
  } catch (error) {
    console.error("ポートフォリオのふりかえりの作成に失敗", error instanceof Error ? error.name : "unknown");
    return { status: 503, body: { error: "相棒につながりませんでした" } };
  }
}

/** Teams へ届ける候補と、下書きでの書き方。相手の言葉や物語、隠しトロフィーの条件は書かない。 */
function shareLines(portfolio: Portfolio): Map<string, string> {
  const lines = new Map<string, string>();
  for (const day of portfolio.days) {
    for (const item of day.items) lines.set(`daily:${item.id}`, `・${item.text}`);
  }
  for (const entry of portfolio.added) {
    if (!entry.shareable) continue;
    const line = entry.kind === "knowledge" ? `・校内の知恵「${entry.text}」` : entry.kind === "trophy" ? `・トロフィー「${entry.text}」` : `・${entry.text}`;
    lines.set(`${entry.kind}:${entry.ref}`, line);
  }
  return lines;
}

/** 本人が選んだ項目から下書きを作る。Claude は呼ばず、何も送らず、何も保存しない。 */
export function buildShareDraft(portfolio: Portfolio, picks: unknown): Outcome {
  if (!Array.isArray(picks) || picks.length === 0 || picks.length > MAX_PICKS) {
    return { status: 400, body: { error: "届ける項目を選んでください" } };
  }
  const lines = shareLines(portfolio);
  const chosen: string[] = [];
  for (const key of new Set(picks)) {
    const line = typeof key === "string" ? lines.get(key) : undefined;
    if (!line) return { status: 400, body: { error: "届けられないものが入っています" } };
    chosen.push(line);
  }
  const draft = [`${portfolio.term.label}のふりかえりから`, ...chosen].join("\n");
  if (draft.length > MAX_BODY_LENGTH) return { status: 400, body: { error: "長すぎるので、項目を減らしてください" } };
  return { status: 200, body: { draft } };
}

function fields(input: unknown): Record<string, unknown> {
  return typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
}

export async function handlePortfolio(
  claude: ClaudeClient,
  db: DatabaseSync,
  personId: string,
  input: unknown,
  options: PortfolioOptions,
): Promise<Outcome> {
  const now = options.now ?? new Date();
  const { action, term: termId, kind, ref, text, picks } = fields(input);
  const term = listTerms(db, personId, now).find((candidate) => candidate.id === termId);
  if (!term) return { status: 400, body: { error: "学期が正しくありません" } };
  const view = () => ({ status: 200, body: { portfolio: getPortfolio(db, personId, term, options) } });

  if (action === "add") {
    // 本人のものだけ。候補にないもの（人の投稿、人宛てのありがとう、取っていないトロフィーなど）は足せない
    const entry = getPortfolio(db, personId, term, options).candidates.find((c) => c.kind === kind && c.ref === ref);
    if (!entry) return { status: 404, body: { error: "足せるものが見つかりません" } };
    db.prepare("INSERT OR IGNORE INTO portfolio_items (person_id, term, kind, ref, added_at) VALUES (?, ?, ?, ?, ?)").run(
      personId,
      term.id,
      entry.kind,
      entry.ref,
      now.toISOString(),
    );
    return view();
  }
  if (action === "remove") {
    if (typeof kind !== "string" || typeof ref !== "string") return { status: 400, body: { error: "依頼が正しくありません" } };
    db.prepare("DELETE FROM portfolio_items WHERE person_id = ? AND term = ? AND kind = ? AND ref = ?").run(personId, term.id, kind, ref);
    return view();
  }
  if (action === "reflect") return reflect(claude, db, personId, term, options);
  if (action === "save-reflection") {
    if (typeof text !== "string" || text.trim() === "" || text.length > MAX_REFLECTION_LENGTH) {
      return { status: 400, body: { error: "言葉が空か、長すぎます" } };
    }
    db.prepare(
      `INSERT INTO portfolio_reflections (person_id, term, text, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (person_id, term) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    ).run(personId, term.id, text.trim(), now.toISOString());
    return view();
  }
  if (action === "delete-reflection") {
    db.prepare("DELETE FROM portfolio_reflections WHERE person_id = ? AND term = ?").run(personId, term.id);
    return view();
  }
  if (action === "share-draft") return buildShareDraft(getPortfolio(db, personId, term, options), picks);
  return { status: 400, body: { error: "依頼が正しくありません" } };
}
