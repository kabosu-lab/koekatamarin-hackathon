import type { ChannelView, PostView } from "./destination/types";
import { cardKind } from "./subject";
import { labelParts } from "./today";

export type FeedItem = {
  post: PostView;
  channel: ChannelView;
  /** 投稿か、いちばん新しい返事の時刻 */
  activeAt: string;
};

/**
 * みんなの画面に並べる、最近動きのあった投稿。見えるチャネルの中から、新しい返事も含めて新しい順に。
 * 範囲を絞った投稿や確認待ちの印は、見える人の一覧（listPosts）がすでに決めている。
 */
export function recentFeed(channels: ChannelView[], postsOf: (channelId: string) => PostView[], limit = 8): FeedItem[] {
  const items: FeedItem[] = [];
  for (const channel of channels) {
    for (const post of postsOf(channel.id)) {
      const latestReply = post.replies.reduce((latest, reply) => (reply.createdAt > latest ? reply.createdAt : latest), "");
      items.push({ post, channel, activeAt: latestReply > post.createdAt ? latestReply : post.createdAt });
    }
  }
  return items.sort((a, b) => b.activeAt.localeCompare(a.activeAt)).slice(0, limit);
}

/**
 * 0-3e：おすすめの段。上から 自分に関係のあるもの → カード → 反応のあったもの → ほか。
 * 自分に関係のあるもの：自分へのメンション（お願いの相手が自分）、自分の投稿にほかの人の返事、肩書きの学年・教科・部活が重なる人の投稿。
 * 送ったばかり（OWN_FRESH_MS 以内）の自分の投稿もここに入れる（話す画面で送ってみんなへ移ったとき、自分の投稿が見つかるように）
 */
export const FEED_TIERS = ["related", "card", "popular", "new"] as const;
export type FeedTier = (typeof FEED_TIERS)[number];

/** 「反応の多いもの」の段に入る、いいねと返事の数の合計の下限 */
export const POPULAR_MIN_REACTIONS = 1;

/** 自分の投稿を「自分に関係のあるもの」に入れておく間（送ってから1日） */
export const OWN_FRESH_MS = 24 * 60 * 60 * 1000;

export function feedTier(post: PostView, viewer: { id: string; label: string }, now: Date = new Date()): FeedTier {
  const mentioned = post.askedPersonId === viewer.id && post.authorId !== viewer.id;
  const repliedToMine = post.authorId === viewer.id && post.replies.some((reply) => reply.authorId !== viewer.id);
  const ownFresh = post.authorId === viewer.id && now.getTime() - new Date(post.createdAt).getTime() < OWN_FRESH_MS;
  // 自分がさっき返事をした投稿も、その話の続きが見えるよう上の段に入れる（1日だけ）
  const repliedByMe = post.replies.some((reply) => reply.authorId === viewer.id && now.getTime() - new Date(reply.createdAt).getTime() < OWN_FRESH_MS);
  const myParts = labelParts(viewer.label);
  const sameGroup = post.authorId !== viewer.id && labelParts(post.authorLabel).some((part) => myParts.includes(part));
  if (mentioned || repliedToMine || ownFresh || repliedByMe || sameGroup) return "related";
  if (cardKind(post.subject)) return "card";
  if (post.likeCount + post.replies.length >= POPULAR_MIN_REACTIONS) return "popular";
  return "new";
}

/**
 * みんなの画面の「おすすめ」の1本の流れ。見えるチャネルの投稿をすべて段に分け、段の順に、同じ段の中は新しい順に並べてから数をしぼる。
 * 見えるチャネル・範囲は channels と postsOf（listChannels・listPosts）がすでに決めている（生徒に職員室の投稿は来ない）
 */
export function recommendedFeed(
  channels: ChannelView[],
  postsOf: (channelId: string) => PostView[],
  viewer: { id: string; label: string },
  limit = 20,
  now: Date = new Date(),
): (FeedItem & { tier: FeedTier })[] {
  const rank = (tier: FeedTier) => FEED_TIERS.indexOf(tier);
  return recentFeed(channels, postsOf, Number.POSITIVE_INFINITY)
    .map((item) => ({ ...item, tier: feedTier(item.post, viewer, now) }))
    .sort((a, b) => rank(a.tier) - rank(b.tier) || b.activeAt.localeCompare(a.activeAt))
    .slice(0, limit);
}

/** 「3分前」「2時間前」「11/5」のような、短い時刻の書き方 */
export function shortAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}時間前`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
