import { describe, expect, it } from "vitest";
import type { ChannelView, PostView } from "./destination/types";
import { recentFeed, shortAgo } from "./minna-feed";

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
