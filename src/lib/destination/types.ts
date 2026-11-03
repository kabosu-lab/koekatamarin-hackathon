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
  /** 「○○さんに聞いてみる」で送った相手 */
  askedPersonName: string | null;
  /** AI と調べたことが入っている印。人の経験と区別するため。 */
  researchedWithAi: boolean;
  likeCount: number;
  likedByViewer: boolean;
  replies: ReplyView[];
};

export type CreatePostOptions = {
  kind?: PostKind;
  researchedWithAi?: boolean;
  askedPersonId?: string;
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
  createPost(viewerId: string, channelId: string, body: string, options?: CreatePostOptions): string;
  createReply(viewerId: string, postId: string, body: string): string;
  toggleLike(viewerId: string, postId: string): void;
  findPersonName(personId: string): string | null;
};
