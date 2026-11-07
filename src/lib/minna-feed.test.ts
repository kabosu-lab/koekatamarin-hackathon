import { describe, expect, it } from "vitest";
import type { ChannelView, PostView } from "./destination/types";
import { feedTier, recentFeed, recommendedFeed, shortAgo } from "./minna-feed";

const channel = (id: string): ChannelView => ({ id, name: id, description: "", audience: "everyone" });
const post = (id: string, createdAt: string, replies: string[] = []) =>
  ({ id, createdAt, replies: replies.map((at, i) => ({ id: `${id}-r${i}`, createdAt: at })) }) as unknown as PostView;

describe("みんなの画面の最近の投稿", () => {
  it("返事が付いた投稿も、返事の時刻で新しい順に並べ、数をしぼる", () => {
    const posts: Record<string, PostView[]> = {
      a: [post("old-with-reply", "2026-11-01T00:00:00Z", ["2026-11-06T00:00:00Z"]), post("mid", "2026-11-04T00:00:00Z")],
      b: [post("new", "2026-11-05T00:00:00Z")],
    };
    const feed = recentFeed([channel("a"), channel("b")], (id) => posts[id], 2);
    expect(feed.map((item) => item.post.id)).toEqual(["old-with-reply", "new"]);
    expect(feed[1].channel.id).toBe("b");
  });

  it("時刻を短く書く", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    expect(shortAgo("2026-11-06T11:59:40Z", now)).toBe("今");
    expect(shortAgo("2026-11-06T11:57:00Z", now)).toBe("3分前");
    expect(shortAgo("2026-11-06T09:00:00Z", now)).toBe("3時間前");
    expect(shortAgo("2026-11-04T09:00:00Z", now)).toMatch(/^11\/4$/);
  });
});

type Shape = { id: string; createdAt: string; authorId?: string; authorLabel?: string; askedPersonId?: string | null; subject?: string | null; likeCount?: number; replies?: { authorId: string; createdAt: string }[] };
const full = ({ authorId = "other", authorLabel = "数学", askedPersonId = null, subject = null, likeCount = 0, replies = [], ...rest }: Shape) =>
  ({ ...rest, authorId, authorLabel, askedPersonId, subject, likeCount, replies: replies.map((r, i) => ({ id: `${rest.id}-r${i}`, ...r })) }) as unknown as PostView;

describe("0-3e：みんなの「おすすめ」の並べ方", () => {
  const viewer = { id: "me", label: "2年・ものづくり部" };

  it("自分へのメンション・自分の投稿への返事・同じ学年や部活の人は、自分に関係のあるもの", () => {
    expect(feedTier(full({ id: "a", createdAt: "x", askedPersonId: "me" }), viewer)).toBe("related");
    expect(feedTier(full({ id: "b", createdAt: "x", authorId: "me", replies: [{ authorId: "other", createdAt: "x" }] }), viewer)).toBe("related");
    expect(feedTier(full({ id: "c", createdAt: "x", authorLabel: "国語・2年担任" }), viewer)).toBe("related");
    expect(feedTier(full({ id: "d", createdAt: "x", authorLabel: "情報・ものづくり部顧問" }), viewer)).toBe("related");
    // 自分の投稿に自分で返しただけ、自分の肩書き、自分が誰かに聞いた投稿は入れない
    expect(feedTier(full({ id: "e", createdAt: "x", authorId: "me", authorLabel: "2年", replies: [{ authorId: "me", createdAt: "x" }] }), viewer)).toBe("popular");
    expect(feedTier(full({ id: "f", createdAt: "2026-11-01T00:00:00Z", authorId: "me", authorLabel: "2年", askedPersonId: "me" }), viewer)).toBe("new");
  });

  it("送ったばかりの自分の投稿は、1日の間だけ自分に関係のあるものに入れる", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(feedTier(full({ id: "a", createdAt: "2026-11-07T11:00:00Z", authorId: "me" }), viewer, now)).toBe("related");
    expect(feedTier(full({ id: "b", createdAt: "2026-11-06T11:00:00Z", authorId: "me" }), viewer, now)).toBe("new");
  });

  it("カード → 反応のあったもの → ほか", () => {
    expect(feedTier(full({ id: "a", createdAt: "x", subject: "【ありがとう】ノートを見せてくれて" }), viewer)).toBe("card");
    expect(feedTier(full({ id: "b", createdAt: "x", subject: "【困りごと】数学", likeCount: 1 }), viewer)).toBe("popular");
    expect(feedTier(full({ id: "c", createdAt: "x", replies: [{ authorId: "x", createdAt: "x" }] }), viewer)).toBe("popular");
    expect(feedTier(full({ id: "d", createdAt: "x", subject: "【うまくいった】発表" }), viewer)).toBe("new");
  });

  it("段の順に並べ、同じ段の中は新しい順。古いメンションも、しぼる前に先へ出す", () => {
    const posts: Record<string, PostView[]> = {
      a: [
        full({ id: "mention-old", createdAt: "2026-10-01T00:00:00Z", askedPersonId: "me" }),
        full({ id: "new-1", createdAt: "2026-11-06T00:00:00Z" }),
        full({ id: "popular-1", createdAt: "2026-11-02T00:00:00Z", likeCount: 3 }),
      ],
      b: [
        full({ id: "card-1", createdAt: "2026-11-01T00:00:00Z", subject: "【おめでとう】大会" }),
        full({ id: "new-2", createdAt: "2026-11-05T00:00:00Z" }),
        full({ id: "popular-2", createdAt: "2026-11-04T00:00:00Z", likeCount: 1 }),
        full({ id: "card-2", createdAt: "2026-11-03T00:00:00Z", subject: "【がんばったね】練習" }),
      ],
    };
    const feed = recommendedFeed([channel("a"), channel("b")], (id) => posts[id], viewer, 6);
    expect(feed.map((item) => item.post.id)).toEqual(["mention-old", "card-2", "card-1", "popular-2", "popular-1", "new-1"]);
    expect(feed.map((item) => item.tier)).toEqual(["related", "card", "card", "popular", "popular", "new"]);
    expect(feed[1].channel.id).toBe("b");
  });

  it("返事の新しさも「新しい」に数える", () => {
    const posts = { a: [full({ id: "old", createdAt: "2026-11-01T00:00:00Z", replies: [{ authorId: "x", createdAt: "2026-11-07T00:00:00Z" }] }), full({ id: "mid", createdAt: "2026-11-05T00:00:00Z", likeCount: 1 })] };
    expect(recommendedFeed([channel("a")], (id) => posts[id as "a"], viewer).map((item) => item.post.id)).toEqual(["old", "mid"]);
  });
});
