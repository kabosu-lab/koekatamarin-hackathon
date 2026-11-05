import type { DatabaseSync } from "node:sqlite";
import { listHiddenIds } from "./hidden-people";
import { forgottenSources } from "./memory";

export type ReplyNotice = {
  replyId: string;
  postId: string;
  channelId: string;
  authorName: string;
  body: string;
};

/** 自分の投稿に届いて、まだ閉じていない返事。新しいものから。隠した相手と、忘れてと言われた言葉は出さない。 */
export function listReplyNotices(db: DatabaseSync, viewerId: string): ReplyNotice[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.post_id, r.author_id, r.body, p.channel_id, a.name AS author_name
       FROM replies r
       JOIN posts p ON p.id = r.post_id
       JOIN people a ON a.id = r.author_id
       WHERE p.author_id = ?
         AND r.author_id <> ?
         AND NOT EXISTS (SELECT 1 FROM seen_replies s WHERE s.reply_id = r.id)
       ORDER BY r.created_at DESC, r.rowid DESC`,
    )
    .all(viewerId, viewerId) as {
    id: string;
    post_id: string;
    author_id: string;
    body: string;
    channel_id: string;
    author_name: string;
  }[];
  const hidden = listHiddenIds(db, viewerId);
  const forgotten = forgottenSources(db);
  return rows
    .filter((row) => !hidden.has(row.author_id) && !forgotten.has(`${row.author_id}|${row.id}`))
    .map((row) => ({
      replyId: row.id,
      postId: row.post_id,
      channelId: row.channel_id,
      authorName: row.author_name,
      body: row.body,
    }));
}

/** 画面に出した分だけ閉じる。あとから届いた返事は残る。自分の投稿への返事でなければ何もしない。 */
export function markRepliesSeen(db: DatabaseSync, viewerId: string, replyIds: string[]): void {
  const mark = db.prepare(
    `INSERT OR IGNORE INTO seen_replies (reply_id)
     SELECT r.id FROM replies r JOIN posts p ON p.id = r.post_id
     WHERE r.id = ? AND p.author_id = ?`,
  );
  for (const replyId of replyIds) mark.run(replyId, viewerId);
}
