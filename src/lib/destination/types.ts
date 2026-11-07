import type { Audience, PostKind } from "../seed-data";

/** 投稿ごとに本人が選ぶ、見える範囲。 */
export type PostScope = "everyone" | "person" | "managers" | "self";

export const POST_SCOPES: readonly PostScope[] = ["everyone", "person", "managers", "self"];

export type PersonView = { id: string; name: string; label: string };

export type ChannelView = {
  id: string;
  name: string;
  description: string;
  audience: Audience;
};

export type ReplyView = {
  id: string;
  authorId: string;
  authorName: string;
  authorLabel: string;
  body: string;
  createdAt: string;
};

export type PostAttachment = { id: string; mediaType: string; fileName: string };

export type PostView = {
  id: string;
  authorId: string;
  authorName: string;
  authorLabel: string;
  kind: PostKind;
  /** 0-3b：件名（頭に種類の札）。古い投稿にはない */
  subject: string | null;
  body: string;
  createdAt: string;
  scope: PostScope;
  /** 教職員にだけ伝える、パートナーからの確認のお願い。判断するのは人。 */
  needsLook: boolean;
  /** 教職員のチャネルで共有済み */
  sharedToStaff: boolean;
  /** 「○○さんに聞いてみる」で送った相手 */
  askedPersonName: string | null;
  /** 0-3e：お願いの相手の ID（みんなの「おすすめ」で、自分へのメンションを先に出す） */
  askedPersonId?: string | null;
  /** お願いをパスでつないだ人（古い順） */
  passedThrough: string[];
  /** お願いされた人が返信した（ゴール） */
  answered: boolean;
  /** AI と調べたことが入っている印。人の経験と区別するため。 */
  /** 付けられた写真か PDF。投稿と同じ範囲の人にだけ見える。 */
  attachment: PostAttachment | null;
  researchedWithAi: boolean;
  likeCount: number;
  likedByViewer: boolean;
  replies: ReplyView[];
  /** 勉強会などの告知。「行きます」を押せる */
  announcement: boolean;
  rsvpCount: number;
  rsvpedByViewer: boolean;
  /** 投稿した本人にだけ見える、行く人の名前 */
  rsvpNames: string[];
};

export type CreatePostOptions = {
  kind?: PostKind;
  /** 0-3b：件名。Teams へは chatMessage の subject で送る */
  subject?: string;
  researchedWithAi?: boolean;
  askedPersonId?: string;
  scope?: PostScope;
  /** scope が person のときの相手 */
  scopePersonId?: string;
  /** 受け取られ方の確認で気になるとされた投稿 */
  needsLook?: boolean;
  /** 勉強会などの告知 */
  announcement?: boolean;
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
  /** 告知への「行きます」を付けたり外したりする。 */
  toggleRsvp(viewerId: string, postId: string): void;
  findPersonName(personId: string): string | null;
  /** 気になる投稿を、教職員だけのチャネルで共有する。教職員だけができる。 */
  shareConcern(viewerId: string, postId: string): boolean;
  listOtherPeople(viewerId: string): PersonView[];
  /** 本人が送った直後の取り消し。誰かが返したあとや、時間が過ぎたあとは取り消せない。 */
  undoPost(viewerId: string, postId: string, now: Date): boolean;
};
