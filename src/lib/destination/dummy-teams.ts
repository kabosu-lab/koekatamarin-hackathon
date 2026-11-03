import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Audience, PostKind, Role } from "../seed-data";
import {
  type ChannelView,
  DestinationError,
  MAX_BODY_LENGTH,
  type PostDestination,
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
  body: string;
  created_at: string;
  researched_with_ai: number;
  asked_person_name: string | null;
  like_count: number;
  liked_by_viewer: number;
};

type ReplyRow = {
  id: string;
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

  function requireVisiblePost(viewerId: string, postId: string): { author_id: string } {
    const post = db.prepare("SELECT channel_id, author_id FROM posts WHERE id = ?").get(postId) as
      | { channel_id: string; author_id: string }
      | undefined;
    if (!post) throw new DestinationError("投稿が見つかりません");
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
      const posts = db
        .prepare(
          `SELECT p.id, p.channel_id, p.author_id, a.name AS author_name, a.label AS author_label,
                  p.kind, p.body, p.created_at, p.researched_with_ai,
                  (SELECT q.name FROM people q WHERE q.id = p.asked_person_id) AS asked_person_name,
                  (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
                  EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.person_id = ?) AS liked_by_viewer
           FROM posts p JOIN people a ON a.id = p.author_id
           WHERE p.channel_id = ?
           ORDER BY p.created_at, p.rowid`,
        )
        .all(viewerId, channelId) as PostRow[];
      const selectReplies = db.prepare(
        `SELECT r.id, a.name AS author_name, a.label AS author_label, r.body, r.created_at
         FROM replies r JOIN people a ON a.id = r.author_id
         WHERE r.post_id = ?
         ORDER BY r.created_at, r.rowid`,
      );

      return posts.map((p): PostView => ({
        id: p.id,
        authorId: p.author_id,
        authorName: p.author_name,
        authorLabel: p.author_label,
        kind: p.kind,
        body: p.body,
        createdAt: p.created_at,
        researchedWithAi: p.researched_with_ai === 1,
        askedPersonName: p.asked_person_name,
        likeCount: p.like_count,
        likedByViewer: p.liked_by_viewer === 1,
        replies: (selectReplies.all(p.id) as ReplyRow[]).map((r): ReplyView => ({
          id: r.id,
          authorName: r.author_name,
          authorLabel: r.author_label,
          body: r.body,
          createdAt: r.created_at,
        })),
      }));
    },

    createPost(viewerId, channelId, body, { kind = "report", researchedWithAi = false, askedPersonId } = {}) {
      requireVisibleChannel(viewerId, channelId);
      if (askedPersonId !== undefined) {
        // 聞く相手が読めないチャネルでは、お願いが届かない
        if (askedPersonId === viewerId) throw new DestinationError("自分には聞けません");
        requireVisibleChannel(askedPersonId, channelId);
      }
      const id = randomUUID();
      db.prepare(
        "INSERT INTO posts (id, channel_id, author_id, kind, body, created_at, researched_with_ai, asked_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        channelId,
        viewerId,
        kind,
        cleanBody(body),
        new Date().toISOString(),
        researchedWithAi ? 1 : 0,
        askedPersonId ?? null,
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
  };
}
