import type { ChannelView, PostView } from "./destination/types";

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

/** 「3分前」「2時間前」「11/5」のような、短い時刻の書き方 */
export function shortAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}時間前`;
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
