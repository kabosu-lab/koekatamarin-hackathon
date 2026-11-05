import type { DatabaseSync } from "node:sqlite";
import { prOfficerId } from "./seed-data";

/**
 * 広報の候補。校内でよく反応があった投稿を、広報の担当にだけ見せる。
 * 外へ出すには本人の確認が要る。断っても誰にも伝わらず、担当にも理由は見えない。
 * 校外へ出す操作はここにはない（学校が確かめて、学校の広報用アカウントから出す）。
 */
const MAX_CANDIDATES = 20;

export type KohoCandidate = { postId: string; body: string; authorName: string };
export type KohoAsked = { postId: string; body: string; authorName: string; agreed: boolean };
export type KohoRequest = { postId: string; body: string; isStudent: boolean };

export function isKohoOfficer(personId: string): boolean {
  return personId === prOfficerId;
}

/** 全員に公開された投稿だけ。範囲を絞った投稿、確認が必要な投稿、お知らせは出さない。順番は担当だけが見る。 */
export function listKohoCandidates(db: DatabaseSync, officerId: string): KohoCandidate[] {
  if (!isKohoOfficer(officerId)) return [];
  const rows = db
    .prepare(
      `SELECT p.id, p.body, a.name AS author_name
       FROM posts p
       JOIN people a ON a.id = p.author_id
       JOIN channels c ON c.id = p.channel_id
       WHERE p.scope = 'everyone' AND p.needs_look = 0 AND p.kind != 'notice' AND c.audience = 'everyone'
         AND p.author_id <> ?
         AND NOT EXISTS (SELECT 1 FROM koho_requests k WHERE k.post_id = p.id)
       ORDER BY (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)
              + (SELECT count(*) FROM replies r WHERE r.post_id = p.id) DESC,
                p.created_at DESC
       LIMIT ?`,
    )
    .all(officerId, MAX_CANDIDATES) as { id: string; body: string; author_name: string }[];
  return rows.map((row) => ({ postId: row.id, body: row.body, authorName: row.author_name }));
}

/** 担当に見えるのは、同意があったものだけ。断られたものと返事がないものは区別しない。 */
export function listKohoAsked(db: DatabaseSync, officerId: string): KohoAsked[] {
  if (!isKohoOfficer(officerId)) return [];
  const rows = db
    .prepare(
      `SELECT k.post_id, k.status, p.body, a.name AS author_name
       FROM koho_requests k JOIN posts p ON p.id = k.post_id JOIN people a ON a.id = p.author_id
       ORDER BY k.requested_at DESC`,
    )
    .all() as { post_id: string; status: string; body: string; author_name: string }[];
  return rows.map((row) => ({ postId: row.post_id, body: row.body, authorName: row.author_name, agreed: row.status === "agreed" }));
}

export function askKoho(db: DatabaseSync, officerId: string, postId: string, now: Date): boolean {
  if (!listKohoCandidates(db, officerId).some((candidate) => candidate.postId === postId)) return false;
  db.prepare("INSERT INTO koho_requests (post_id, status, requested_at) VALUES (?, 'waiting', ?)").run(postId, now.toISOString());
  return true;
}

/** 本人に届いている確認。 */
export function listKohoRequests(db: DatabaseSync, personId: string): KohoRequest[] {
  const rows = db
    .prepare(
      `SELECT k.post_id, p.body, a.role
       FROM koho_requests k JOIN posts p ON p.id = k.post_id JOIN people a ON a.id = p.author_id
       WHERE p.author_id = ? AND k.status = 'waiting'
       ORDER BY k.requested_at`,
    )
    .all(personId) as { post_id: string; body: string; role: string }[];
  return rows.map((row) => ({ postId: row.post_id, body: row.body, isStudent: row.role === "student" }));
}

/** 本人が答える。生徒が「よい」と答えるには、保護者の同意も要る。 */
export function answerKoho(db: DatabaseSync, personId: string, postId: string, agree: boolean, guardian: boolean): boolean {
  const request = listKohoRequests(db, personId).find((item) => item.postId === postId);
  if (!request) return false;
  if (agree && request.isStudent && !guardian) return false;
  db.prepare("UPDATE koho_requests SET status = ? WHERE post_id = ?").run(agree ? "agreed" : "declined", postId);
  return true;
}
