import type { DatabaseSync } from "node:sqlite";
import { listReceived } from "./daily";
import type { PostDestination } from "./destination/types";
import { listHiddenIds } from "./hidden-people";
import { isNoticeHours, listInbox } from "./inbox";
import { listKnowledgeTasks } from "./knowledge";
import { listReplyNotices, markRepliesSeen } from "./reply-notices";
import { THANKS_REVEAL_HREF } from "./thanks-kind";
import { FIRST_RANDOM, listTodayCards } from "./today";

/**
 * 0-2v：新着の数。タイル・下の帯・ホーム（話す画面）・ホイールのチップは、すべてこの数を使う。
 * - 受信箱：まだ返していないお願い（メンション）、確認の要る知恵、まだ開いていない返事、まだ開いていない届いた日報
 * - ありがとう：まだ開いていない、もらったありがとう
 * - コレクション：コレクションを最後に開いたあとに届いた、開けていない贈り物の卵と、まだ見ていないトロフィー
 * - 今日の3人：今日まだ見ていないとき、その人数
 * 受信箱は通知してよい時間（平日の朝から夕方）だけ数える。時間外は 0 にして、新しい義務感にしない。
 */
export type NewCounts = {
  inbox: number;
  /** 受信箱の内訳。パートナーの一言を選ぶのに使う */
  replies: number;
  asks: number;
  reports: number;
  thanks: number;
  collection: number;
  today: number;
};

/** 下の帯の左右（ホームの点）。履歴と設定の側と、みんなの側 */
export function sideCounts(counts: NewCounts): { me: number; minna: number } {
  return { me: counts.thanks + counts.collection, minna: counts.inbox + counts.today };
}

const seenKey = (kind: "thanks" | "reports" | "collection", viewerId: string) => `seen|${kind}|${viewerId}`;

function readSeen(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSeen(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
}

function seenReportIds(db: DatabaseSync, viewerId: string): Set<string> {
  const stored = readSeen(db, seenKey("reports", viewerId));
  if (!stored) return new Set();
  try {
    const parsed: unknown = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** 「ありがとう」を最後に開いた時刻（0-3a の封筒の演出も、これより後に届いたものを開ける） */
export function thanksSeenSince(db: DatabaseSync, viewerId: string): string | null {
  return readSeen(db, seenKey("thanks", viewerId));
}

function countNewThanks(db: DatabaseSync, viewerId: string): number {
  const since = thanksSeenSince(db, viewerId) ?? "";
  const hidden = listHiddenIds(db, viewerId);
  const rows = db
    .prepare("SELECT from_person_id FROM thanks WHERE to_person_id = ? AND created_at > ?")
    .all(viewerId, since) as { from_person_id: string }[];
  return rows.filter((row) => !hidden.has(row.from_person_id)).length;
}

function countNewCollection(db: DatabaseSync, viewerId: string): number {
  const since = readSeen(db, seenKey("collection", viewerId)) ?? "";
  const eggs = db
    .prepare("SELECT COUNT(*) AS n FROM gift_eggs WHERE person_id = ? AND opened_at IS NULL AND earned_at > ?")
    .get(viewerId, since) as { n: number };
  const ribbons = db
    .prepare("SELECT COUNT(*) AS n FROM person_ribbons WHERE person_id = ? AND seen_at IS NULL AND earned_at > ?")
    .get(viewerId, since) as { n: number };
  return eggs.n + ribbons.n;
}

export function countNew(
  db: DatabaseSync,
  destination: PostDestination,
  viewerId: string,
  now: Date,
  options: { rewards: boolean; todaySeen: boolean },
): NewCounts {
  const noticeHours = isNoticeHours(now);
  const asks = noticeHours ? listInbox(db, viewerId).length + listKnowledgeTasks(db, viewerId).length : 0;
  const replies = noticeHours ? listReplyNotices(db, viewerId).length : 0;
  const seenReports = seenReportIds(db, viewerId);
  const reports = noticeHours ? listReceived(db, viewerId).filter((report) => !seenReports.has(report.reportId)).length : 0;
  const collection = options.rewards ? countNewCollection(db, viewerId) : 0;
  const today = options.todaySeen ? 0 : Math.min(FIRST_RANDOM, listTodayCards(destination, viewerId, now, listHiddenIds(db, viewerId)).length);
  return { inbox: asks + replies + reports, replies, asks, reports, thanks: countNewThanks(db, viewerId), collection, today };
}

/** 受信箱を開いた。返事と届いた日報は消える。お願いと知恵の確認は、応えるまで残る */
export function markInboxOpened(db: DatabaseSync, viewerId: string): void {
  markRepliesSeen(
    db,
    viewerId,
    listReplyNotices(db, viewerId).map((notice) => notice.replyId),
  );
  const ids = new Set([...seenReportIds(db, viewerId), ...listReceived(db, viewerId).map((report) => report.reportId)]);
  writeSeen(db, seenKey("reports", viewerId), JSON.stringify([...ids]));
}

/** もらったありがとうを開いた */
export function markThanksOpened(db: DatabaseSync, viewerId: string, now: Date): void {
  writeSeen(db, seenKey("thanks", viewerId), now.toISOString());
}

/** コレクション（パートナーのタイル）を開いた。卵は開けるまでコレクションに残るが、新着の数からは消える */
export function markCollectionOpened(db: DatabaseSync, viewerId: string, now: Date): void {
  writeSeen(db, seenKey("collection", viewerId), now.toISOString());
}

export type NewsLine = { text: string; href: string };

/**
 * パートナーの最初の一言（新着があるとき）。押すとその画面へ行く。
 * 生徒には友だちの口調、先生にはです・ます。新着がなければ null（いつもの一言のまま）。
 * 今日の3人は「みんな」を開くと自動で出るので、ここでは言わない。
 */
export function newsLine(counts: NewCounts, role: string): NewsLine | null {
  const polite = role !== "student";
  const minna = polite ? "みんなのほうにあります" : "みんなのほうにあるよ";
  const me = polite ? "履歴と設定のほうにあります" : "履歴と設定のほうにあるよ";
  const arrived = (what: string, n: number) => (polite ? `${what}が${n}件届いています` : `${what}が${n}件届いてるよ`);
  // 0-3a：ありがとうがいちばん先。パートナーが封筒を抱えて知らせ、押すとその場で封筒が開く（履歴と設定へは行かない）。
  // お願いは返すまで残るので、受信箱を先にすると、届いたありがとうにいつまでも気づけない
  if (counts.thanks > 0) return { text: polite ? "ありがとうが届いています" : "ありがとうが届いてるよ", href: THANKS_REVEAL_HREF };
  if (counts.inbox > 0) {
    if (counts.replies === counts.inbox) return { text: `${arrived("返事", counts.replies)}。${minna}`, href: "/inbox#replies" };
    return { text: `${polite ? `受信箱に${counts.inbox}件届いています` : `受信箱に${counts.inbox}件届いてるよ`}。${minna}`, href: "/inbox" };
  }
  if (counts.collection > 0)
    return {
      text: polite ? `コレクションに新しいものが${counts.collection}個あります。${me}` : `コレクションに新しいのが${counts.collection}個あるよ。${me}`,
      href: "/me?open=partner",
    };
  return null;
}
