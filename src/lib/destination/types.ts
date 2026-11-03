import type { Audience, PostKind } from "../seed-data";

export type ChannelView = {
  id: string;
  name: string;
  description: string;
  audience: Audience;
};

export type ReplyView = {
  id: string;
  authorName: string;
  authorLabel: string;
  body: string;
  createdAt: string;
};

export type PostView = {
  id: string;
  authorId: string;
  authorName: string;
  authorLabel: string;
  kind: PostKind;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByViewer: boolean;
  replies: ReplyView[];
};

export class DestinationError extends Error {}

export const MAX_BODY_LENGTH = 2000;

/**
 * 投稿先の差し替え口。提出版は Teams 風のダミーにつなぎ、
 * 同じ形のまま本物の Teams につなげるようにする。
 * viewerId は操作する人で、見られるチャネルの判断はこの部品が持つ。
 */
export type PostDestination = {
  listChannels(viewerId: string): ChannelView[];
  listPosts(viewerId: string, channelId: string): PostView[];
  createPost(viewerId: string, channelId: string, body: string): string;
  createReply(viewerId: string, postId: string, body: string): string;
  toggleLike(viewerId: string, postId: string): void;
};
