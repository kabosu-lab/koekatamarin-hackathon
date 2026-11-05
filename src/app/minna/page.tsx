import { Icon } from "@/app/Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { recentFeed, shortAgo } from "@/lib/minna-feed";
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
import { DeviceFrame } from "../DeviceFrame";
import { RoomBackdrop } from "../study/room/RoomBackdrop";
import "../study/room/room.css";

export const metadata: Metadata = { title: "みんな｜こえかた" };
export const dynamic = "force-dynamic";

export default async function MinnaPage() {
  const { viewer } = await getViewer();
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
  const feed = recentFeed(destination.listChannels(viewer.id), (channelId) => destination.listPosts(viewer.id, channelId), 6);

  return (
    <DeviceFrame
      label="みんな"
      dot={2}
      left={{ href: "/today", label: "今日の3人", icon: "heart" }}
      right={{ href: "/inbox", label: "受信箱", icon: "inbox" }}
      screen={
        // 上の窓は、校内の桜。触ると詳しい画面へ
        <Link className="sakura-scene minna-sakura" data-time={timeOfDay(now)} href="/sakura" aria-label="桜の木を大きく見る">
          <RoomBackdrop place="garden" label="校庭の桜の木" season={sakura.season} />
          {isBloomingSeason(sakura.season) &&
            Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="petal" aria-hidden="true" style={{ left: `${8 + i * 15}%`, animationDelay: `${i * 0.9}s` }} />
            ))}
          <span className="caption">今年の葉 {sakura.leaves} 枚</span>
        </Link>
      }
    >
      <main className="home">
        <header>
          <h1>みんな</h1>
          <p>{schoolName}</p>
        </header>


        {feed.length > 0 && (
          <section className="minna-feed" aria-label="最近の投稿と返事">
            <h2>最近の投稿と返事</h2>
            <ul>
              {feed.map(({ post, channel, activeAt }) => {
                const lastReply = post.replies.at(-1);
                return (
                  <li key={post.id}>
                    <Link href={`/teams?channel=${channel.id}#post-${post.id}`}>
                      <span className="minna-feed-head">
                        <strong>{post.authorName}</strong>
                        <small>
                          {channel.name}・{shortAgo(activeAt, now)}
                        </small>
                      </span>
                      <span className="minna-feed-body">{post.body}</span>
                      {lastReply && (
                        <span className="minna-feed-reply">
                          ↳ {lastReply.authorName}：{lastReply.body}
                          {post.replies.length > 1 && <small>（返事 {post.replies.length} 件）</small>}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 校内の桜。個人を比べず、責めない。控えめでも枯れない */}
        <Link className="sakura-line" href="/sakura" aria-label="校内の桜">
          <strong>校内の桜</strong>
          <span>{sakura.message}</span>
          <small>
            今週 {grown} 枚の葉が増えました（今年 {sakura.leaves} 枚）
          </small>
        </Link>

        <nav className="quick-links" aria-label="届いているもの">
          <Link href="/inbox">
            <Icon name="inbox" />
            受信箱
            {waiting > 0 && `（お願いが ${waiting} 件）`}
            {knowledgeTasks > 0 && `（知恵の確認が ${knowledgeTasks} 件）`}
          </Link>
          {eggs > 0 && (
            <Link href="/me">
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

        <div className="hub-links">
          <Link href="/today">
            <Icon name="heart" />
            今日の3人
          </Link>
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
        </div>

        {events.map((event) => (
          <section className="event-banner" key={event.id} aria-label="期間限定のイベント">
            <strong>{event.name}</strong>
            <span>{event.message}</span>
            <small>期間限定のトロフィー「{event.ribbon.name}」：{event.ribbon.description}と届きます</small>
          </section>
        ))}
      </main>
    </DeviceFrame>
  );
}
