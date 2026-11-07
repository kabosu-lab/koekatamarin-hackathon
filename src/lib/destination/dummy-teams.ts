import { randomUUID } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { recipientsOf } from "../recipients";
import type { Audience, PostKind, Role } from "../seed-data";
import {
  type ChannelView,
  DestinationError,
  MAX_BODY_LENGTH,
  type PersonView,
  type PostAttachment,
  type PostDestination,
  type PostScope,
  type PostView,
  type ReplyView,
} from "./types";

type ChannelRow = ChannelView;

type PostRow = {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  author_label: string;
  kind: PostKind;
  subject: string | null;
  body: string;
  created_at: string;
  researched_with_ai: number;
  scope: PostScope;
  scope_person_id: string | null;
  needs_look: number;
  is_announcement: number;
  shared_to_staff: number;
  asked_person_name: string | null;
  asked_person_id: string | null;
  answered: number;
  like_count: number;
  liked_by_viewer: number;
};

type ReplyRow = {
  id: string;
  author_id: string;
  author_name: string;
  author_label: string;
  body: string;
  created_at: string;
};

function canSee(role: Role, audience: Audience): boolean {
  return audience === "everyone" || role !== "student";
}

function cleanBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") throw new DestinationError("本文が空です");
  if (trimmed.length > MAX_BODY_LENGTH) throw new DestinationError("本文が長すぎます");
  return trimmed;
}

function attachmentOf(select: StatementSync, postId: string): PostAttachment | null {
  const row = select.get(postId) as { id: string; media_type: string; file_name: string } | undefined;
  return row ? { id: row.id, mediaType: row.media_type, fileName: row.file_name } : null;
}

/** 取り消せるのは、送ってからこの時間まで */
const UNDO_WINDOW_MS = 5 * 60 * 1000;

/** SQLite に保存する、Teams 風のダミーの投稿先。 */
export function createDummyTeams(db: DatabaseSync): PostDestination {
  function roleOf(viewerId: string): Role {
    const row = db.prepare("SELECT role FROM people WHERE id = ?").get(viewerId) as
      | { role: Role }
      | undefined;
    if (!row) throw new DestinationError("人物が見つかりません");
    return row.role;
  }

  function requireVisibleChannel(viewerId: string, channelId: string): void {
    const role = roleOf(viewerId);
    const channel = db.prepare("SELECT audience FROM channels WHERE id = ?").get(channelId) as
      | { audience: Audience }
      | undefined;
    // 見られないチャネルは、あることも伝えない
    if (!channel || !canSee(role, channel.audience)) {
      throw new DestinationError("チャネルが見つかりません");
    }
  }

  /** 投稿ごとの見える範囲。範囲の外の人には、投稿があることも伝えない。 */
  function canSeeScope(
    viewerId: string,
    post: { author_id: string; scope: PostScope; scope_person_id: string | null },
  ): boolean {
    if (post.author_id === viewerId || post.scope === "everyone") return true;
    if (post.scope === "person") return post.scope_person_id === viewerId;
    if (post.scope === "managers") return recipientsOf(db, post.author_id).some((r) => r.id === viewerId);
    return false;
  }

  function requireVisiblePost(viewerId: string, postId: string): { author_id: string } {
    const post = db.prepare("SELECT channel_id, author_id, scope, scope_person_id FROM posts WHERE id = ?").get(postId) as
      | { channel_id: string; author_id: string; scope: PostScope; scope_person_id: string | null }
      | undefined;
    if (!post || !canSeeScope(viewerId, post)) throw new DestinationError("投稿が見つかりません");
    try {
      requireVisibleChannel(viewerId, post.channel_id);
    } catch {
      throw new DestinationError("投稿が見つかりません");
    }
    return post;
  }

  return {
    listChannels(viewerId) {
      const role = roleOf(viewerId);
      const rows = db
        .prepare("SELECT id, name, description, audience FROM channels ORDER BY rowid")
        .all() as ChannelRow[];
      return rows.filter((c) => canSee(role, c.audience));
    },

    listPosts(viewerId, channelId) {
      requireVisibleChannel(viewerId, channelId);
      const viewerIsStaff = roleOf(viewerId) !== "student";
      const posts = db
        .prepare(
          `SELECT p.id, p.channel_id, p.author_id, a.name AS author_name, a.label AS author_label,
                  p.kind, p.subject, p.body, p.created_at, p.researched_with_ai, p.scope, p.scope_person_id, p.needs_look, p.shared_to_staff, p.is_announcement, p.asked_person_id,
                  (SELECT q.name FROM people q WHERE q.id = p.asked_person_id) AS asked_person_name,
                  EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = p.asked_person_id) AS answered,
                  (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
                  EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.person_id = ?) AS liked_by_viewer
           FROM posts p JOIN people a ON a.id = p.author_id
           WHERE p.channel_id = ?
           ORDER BY p.created_at, p.rowid`,
        )
        .all(viewerId, channelId) as PostRow[];
      const selectReplies = db.prepare(
        `SELECT r.id, r.author_id, a.name AS author_name, a.label AS author_label, r.body, r.created_at
         FROM replies r JOIN people a ON a.id = r.author_id
         WHERE r.post_id = ?
         ORDER BY r.created_at, r.rowid`,
      );

      const selectPasses = db.prepare(
        `SELECT q.name FROM post_passes x JOIN people q ON q.id = x.from_person_id
         WHERE x.post_id = ? ORDER BY x.created_at, x.rowid`,
      );

      const selectAttachment = db.prepare("SELECT id, media_type, file_name FROM attachments WHERE post_id = ?");
      const selectRsvps = db.prepare(
        "SELECT q.id, q.name FROM post_rsvps x JOIN people q ON q.id = x.person_id WHERE x.post_id = ? ORDER BY q.rowid",
      );

      return posts.filter((p) => canSeeScope(viewerId, { ...p, author_id: p.author_id })).map((p): PostView => {
        const rsvps = p.is_announcement === 1 ? (selectRsvps.all(p.id) as { id: string; name: string }[]) : [];
        return {
        announcement: p.is_announcement === 1,
        rsvpCount: rsvps.length,
        rsvpedByViewer: rsvps.some((rsvp) => rsvp.id === viewerId),
        rsvpNames: p.author_id === viewerId ? rsvps.map((rsvp) => rsvp.name) : [],
        id: p.id,
        authorId: p.author_id,
        authorName: p.author_name,
        authorLabel: p.author_label,
        kind: p.kind,
        subject: p.subject,
        body: p.body,
        createdAt: p.created_at,
        researchedWithAi: p.researched_with_ai === 1,
        attachment: attachmentOf(selectAttachment, p.id),
        scope: p.scope,
        // 本人や生徒には見せない。教職員が確かめるためのもの
        needsLook: viewerIsStaff && p.author_id !== viewerId && p.needs_look === 1,
        sharedToStaff: viewerIsStaff && p.shared_to_staff === 1,
        askedPersonName: p.asked_person_name,
        askedPersonId: p.asked_person_id,
        passedThrough: (selectPasses.all(p.id) as { name: string }[]).map((x) => x.name),
        answered: p.answered === 1,
        likeCount: p.like_count,
        likedByViewer: p.liked_by_viewer === 1,
        replies: (selectReplies.all(p.id) as ReplyRow[]).map((r): ReplyView => ({
          id: r.id,
          authorId: r.author_id,
          authorName: r.author_name,
          authorLabel: r.author_label,
          body: r.body,
          createdAt: r.created_at,
        })),
        };
      });
    },

    createPost(
      viewerId,
      channelId,
      body,
      { kind = "report", subject, researchedWithAi = false, askedPersonId, scope = "everyone", scopePersonId, needsLook = false, announcement = false } = {},
    ) {
      requireVisibleChannel(viewerId, channelId);
      if (askedPersonId !== undefined) {
        // 聞く相手が読めないチャネルでは、お願いが届かない
        if (askedPersonId === viewerId) throw new DestinationError("自分には聞けません");
        requireVisibleChannel(askedPersonId, channelId);
        // お願いは相手に届くものなので、相手が読めない範囲には置かない
        if (scope !== "everyone" && !(scope === "person" && scopePersonId === askedPersonId)) {
          throw new DestinationError("聞く相手に見える範囲にしてください");
        }
      }
      if (scope === "person") {
        if (!scopePersonId || scopePersonId === viewerId) throw new DestinationError("見せる相手を選んでください");
        requireVisibleChannel(scopePersonId, channelId);
      }
      const id = randomUUID();
      db.prepare(
        `INSERT INTO posts (id, channel_id, author_id, kind, body, created_at, researched_with_ai, asked_person_id, scope, scope_person_id, needs_look, is_announcement, subject)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        channelId,
        viewerId,
        kind,
        cleanBody(body),
        new Date().toISOString(),
        researchedWithAi ? 1 : 0,
        askedPersonId ?? null,
        scope,
        scope === "person" ? (scopePersonId ?? null) : null,
        // 範囲を絞った投稿は相手を本人が選んでいるので、他の教職員へ広げるきっかけにしない
        needsLook && scope === "everyone" ? 1 : 0,
        announcement ? 1 : 0,
        subject?.trim() ? subject.trim() : null,
      );
      return id;
    },

    createReply(viewerId, postId, body) {
      requireVisiblePost(viewerId, postId);
      const id = randomUUID();
      db.prepare(
        "INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(id, postId, viewerId, cleanBody(body), new Date().toISOString());
      return id;
    },

    shareConcern(viewerId, postId) {
      if (roleOf(viewerId) === "student") return false;
      const post = db
        .prepare(
          `SELECT p.body, p.scope, p.shared_to_staff, p.author_id, a.name AS author_name, c.name AS channel_name, c.audience
           FROM posts p JOIN people a ON a.id = p.author_id JOIN channels c ON c.id = p.channel_id
           WHERE p.id = ?`,
        )
        .get(postId) as
        | { body: string; scope: PostScope; shared_to_staff: number; author_id: string; author_name: string; channel_name: string; audience: Audience }
        | undefined;
      // 共有できるのは、校内に出た投稿だけ。範囲を絞った投稿を他の教職員へ広げない
      if (!post || post.scope !== "everyone" || post.audience !== "everyone" || post.shared_to_staff === 1) return false;
      const staffChannel = db.prepare("SELECT id FROM channels WHERE audience = 'staff' ORDER BY rowid LIMIT 1").get() as
        | { id: string }
        | undefined;
      if (!staffChannel) return false;

      db.prepare(
        "INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, ?, ?, 'worry', ?, ?)",
      ).run(
        randomUUID(),
        staffChannel.id,
        viewerId,
        `気になる投稿を共有します（${post.channel_name}・${post.author_name}さん）。一人で抱えず、担任、生徒指導、学年長、管理職で一緒に見てください。\n「${post.body}」`,
        new Date().toISOString(),
      );
      db.prepare("UPDATE posts SET shared_to_staff = 1 WHERE id = ?").run(postId);
      return true;
    },

    listOtherPeople(viewerId) {
      const rows = db
        .prepare("SELECT id, name, label FROM people WHERE id != ? ORDER BY rowid")
        .all(viewerId) as PersonView[];
      return rows.map(({ id, name, label }) => ({ id, name, label }));
    },

    undoPost(viewerId, postId, now) {
      const post = db.prepare("SELECT author_id, created_at FROM posts WHERE id = ?").get(postId) as
        | { author_id: string; created_at: string }
        | undefined;
      if (!post || post.author_id !== viewerId) return false;
      if (now.getTime() - Date.parse(post.created_at) > UNDO_WINDOW_MS) return false;
      if (db.prepare("SELECT 1 FROM replies WHERE post_id = ?").get(postId)) return false;
      db.prepare("DELETE FROM post_passes WHERE post_id = ?").run(postId);
      db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
      return true;
    },

    findPersonName(personId) {
      const row = db.prepare("SELECT name FROM people WHERE id = ?").get(personId) as { name: string } | undefined;
      return row?.name ?? null;
    },

    toggleLike(viewerId, postId) {
      const post = requireVisiblePost(viewerId, postId);
      // 自分の投稿へのいいねは数えない（桜の葉にもなるため）
      if (post.author_id === viewerId) {
        throw new DestinationError("自分の投稿にはいいねできません");
      }
      const removed = db
        .prepare("DELETE FROM post_likes WHERE post_id = ? AND person_id = ?")
        .run(postId, viewerId);
      if (removed.changes === 0) {
        db.prepare("INSERT INTO post_likes (post_id, person_id) VALUES (?, ?)").run(postId, viewerId);
      }
    },

    toggleRsvp(viewerId, postId) {
      requireVisiblePost(viewerId, postId);
      const row = db.prepare("SELECT is_announcement FROM posts WHERE id = ?").get(postId) as { is_announcement: number } | undefined;
      if (row?.is_announcement !== 1) throw new DestinationError("告知ではありません");
      const removed = db.prepare("DELETE FROM post_rsvps WHERE post_id = ? AND person_id = ?").run(postId, viewerId);
      if (removed.changes === 0) db.prepare("INSERT INTO post_rsvps (post_id, person_id) VALUES (?, ?)").run(postId, viewerId);
    },
  };
}
