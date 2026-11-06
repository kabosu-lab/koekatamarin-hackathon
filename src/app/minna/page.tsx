import { Icon } from "@/app/Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { feedChannels, recentFeed, shortAgo } from "@/lib/minna-feed";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { activeEvents } from "@/lib/events";
import { listGiftEggs } from "@/lib/gift-eggs";
import { countForNotice } from "@/lib/inbox";
import { countKnowledgeForNotice } from "@/lib/knowledge";
import { isKohoOfficer } from "@/lib/koho";
import { showsRewards } from "@/lib/rewards-view";
import { listAlertsFor } from "@/lib/safety";
import { getSakura, isBloomingSeason, leavesThisWeek, timeOfDay } from "@/lib/sakura";
import { counselorId, schoolName } from "@/lib/seed-data";
import { isTrialMode } from "@/lib/trial";
import { ChannelChips, ChannelFilter, FilteredItem, FilteredList } from "./ChannelChips";
import { MinnaFrame } from "./MinnaFrame";
import { ReplyField } from "./ReplyField";
import "./minna.css";

export const metadata: Metadata = { title: "みんな｜こえかた" };
export const dynamic = "force-dynamic";

/** みんなの画面に並べる投稿の数。本文は切らずに全部出す（0-1k(4)） */
const FEED_LIMIT = 20;

export default async function MinnaPage({ searchParams }: { searchParams: Promise<{ hayaokuri?: string | string[] }> }) {
  const { viewer } = await getViewer();
  const { hayaokuri } = await searchParams;
  const db = getDatabase();
  await syncFromTeamsIfStale(db);
  const now = new Date();
  const sakura = getSakura(db, now);
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const events = rewards ? activeEvents(now) : [];
  const waiting = countForNotice(db, viewer.id, now);
  const knowledgeTasks = countKnowledgeForNotice(db, viewer.id, now);
  const eggs = rewards ? listGiftEggs(db, viewer.id).length : 0;
  const hasAlerts = !isTrialMode() && viewer.role !== "student" && (viewer.id === counselorId || listAlertsFor(db, viewer.id).length > 0);
  const grown = leavesThisWeek(db, now);
  const destination = getDestination(db);
  const channels = destination.listChannels(viewer.id);
  const feed = recentFeed(channels, (channelId) => destination.listPosts(viewer.id, channelId), FEED_LIMIT);

  return (
    <ChannelFilter>
      <MinnaFrame
        title="みんな"
        subtitle={schoolName}
        season={sakura.season}
        time={timeOfDay(now)}
        leaves={sakura.leaves}
        grown={grown}
        message={sakura.message}
        petals={isBloomingSeason(sakura.season) ? 6 : 0}
        fastForward={hayaokuri === "1"}
        chips={<ChannelChips channels={feedChannels(channels, feed).map(({ id, name }) => ({ id, name }))} />}
        entrances={
          // 0-1f：「今日の3人」と「受信箱」の入口は、札の列の右端に小さく
          <nav className="minna-entrances" aria-label="みんなの入口">
            <Link href="/today">
              <Icon name="heart" />
              <span className="minna-entrance-text">今日の3人</span>
            </Link>
            <Link href="/inbox">
              <Icon name="inbox" />
              <span className="minna-entrance-text">受信箱</span>
              {waiting + knowledgeTasks > 0 && <span className="minna-entrance-badge">{waiting + knowledgeTasks}</span>}
            </Link>
          </nav>
        }
      >
        {feed.length > 0 ? (
          <FilteredList label="最近の投稿と返事">
            {feed.map(({ post, channel, activeAt }) => (
              <FilteredItem key={post.id} channelId={channel.id}>
                <article className="minna-post" aria-label={`${post.authorName}さんの投稿`}>
                  <header className="minna-post-head">
                    <strong>{post.authorName}</strong>
                    <span className="minna-post-role">{post.authorLabel}</span>
                    <small>
                      {channel.name}・{shortAgo(activeAt, now)}
                    </small>
                  </header>
                  {/* 本文は途中で切らず、全部出す */}
                  <p className="minna-post-body">{post.body}</p>
                  {post.attachment && <p className="minna-post-note">写真や資料が付いています</p>}
                  {post.replies.length > 0 && (
                    <ul className="minna-post-replies" aria-label="返事">
                      {post.replies.map((reply) => (
                        <li key={reply.id}>
                          <span className="minna-post-head">
                            <strong>{reply.authorName}</strong>
                            <small>{shortAgo(reply.createdAt, now)}</small>
                          </span>
                          <p className="minna-post-body">{reply.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ReplyField
                    postId={post.id}
                    authorName={post.authorName}
                    own={post.authorId === viewer.id}
                    likeCount={post.likeCount}
                    liked={post.likedByViewer}
                    replyCount={post.replies.length}
                  />
                  <Link className="minna-post-open" href={`/teams?channel=${channel.id}#post-${post.id}`}>
                    {channel.name}で見る
                  </Link>
                </article>
              </FilteredItem>
            ))}
          </FilteredList>
        ) : (
          <p className="minna-post-empty">まだ投稿はありません。話す画面から、パートナーと一緒に最初の一言を。</p>
        )}

        {/* 新しい投稿の欄は置かない。新しく話すのは「話す」画面から */}
        <Link className="minna-talk-link" href="/">
          新しく話す →
        </Link>

        <nav className="minna-more" aria-label="届いているもの">
          <Link href="/inbox">
            <Icon name="inbox" />
            受信箱
            {waiting > 0 && `（お願いが ${waiting} 件）`}
            {knowledgeTasks > 0 && `（知恵の確認が ${knowledgeTasks} 件）`}
          </Link>
          {eggs > 0 && (
            <Link href="/me?open=collect">
              <Icon name="gift" />
              贈り物の卵が届いています
            </Link>
          )}
          {hasAlerts && (
            <Link href="/soudan">
              <Icon name="shield" />
              相談室への知らせを見る
            </Link>
          )}
          {isKohoOfficer(viewer.id) && (
            <Link href="/koho">
              <Icon name="star" />
              広報の候補
            </Link>
          )}
        </nav>

        <nav className="minna-more" aria-label="ほかの場所">
          <Link href="/teams">
            <Icon name="chat" />
            校内チャネル（Teams）
          </Link>
          <Link href="/study/room">
            <Icon name="book" />
            自習室
          </Link>
          <Link href="/study">
            <Icon name="book" />
            一緒に勉強する
          </Link>
          <Link href="/chie">
            <Icon name="idea" />
            校内の知恵
          </Link>
        </nav>

        {events.map((event) => (
          <section className="minna-event" key={event.id} aria-label="期間限定のイベント">
            <strong>{event.name}</strong>
            <span>{event.message}</span>
            <small>
              期間限定のトロフィー「{event.ribbon.name}」：{event.ribbon.description}と届きます
            </small>
          </section>
        ))}
      </MinnaFrame>
    </ChannelFilter>
  );
}
