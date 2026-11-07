import { Icon } from "@/app/Icon";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { getAvatar } from "@/lib/avatar";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { feedChannels, recentFeed, shortAgo } from "@/lib/minna-feed";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { activeEvents } from "@/lib/events";
import { listGiftEggs } from "@/lib/gift-eggs";
import { listCelebratedPostIds } from "@/lib/goals";
import { listHiddenIds } from "@/lib/hidden-people";
import { countNew } from "@/lib/new-counts";
import { isKohoOfficer } from "@/lib/koho";
import { showsRewards } from "@/lib/rewards-view";
import { listAlertsFor } from "@/lib/safety";
import { getSakura, isBloomingSeason, leavesThisWeek, timeOfDay } from "@/lib/sakura";
import { counselorId, schoolName } from "@/lib/seed-data";
import { FIRST_RANDOM, listTodayCards, todayAffinity, viewerPublicWords } from "@/lib/today";
import { isTrialMode } from "@/lib/trial";
import { ChannelChips, ChannelFilter, FilteredItem, FilteredList } from "./ChannelChips";
import { MinnaFrame } from "./MinnaFrame";
import { ReplyField } from "./ReplyField";
import { TodayEntrance, TodayModal, type TodayModalCard, TodayProvider } from "./TodayModal";
import { teamsUrl } from "./teams-link";
import { TODAY_SEEN_COOKIE } from "./today-seen";
import { ThanksEntry } from "../thanks/ThanksCard";
import { thanksEntryLabel } from "@/lib/thanks-kind";
import type { PostView } from "@/lib/destination/types";
import { cardAttr, PostSubject } from "@/app/PostSubject";
import "./minna.css";

export const metadata: Metadata = { title: "みんな｜こえかた" };
export const dynamic = "force-dynamic";

/** みんなの画面に並べる投稿の数。本文は切らずに全部出す（0-1k(4)） */
const FEED_LIMIT = 20;
/** 今日の3人のあとに続ける、関係のありそうな投稿の数（数枚で終わる） */
const RELATED_LIMIT = 3;

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
  const eggs = rewards ? listGiftEggs(db, viewer.id).length : 0;
  const hasAlerts = !isTrialMode() && viewer.role !== "student" && (viewer.id === counselorId || listAlertsFor(db, viewer.id).length > 0);
  const grown = leavesThisWeek(db, now);
  const destination = getDestination(db);
  const teamsLink = teamsUrl();
  // 0-2v：新着の数はホーム・履歴と設定・ホイールと同じ数え方（1か所）
  const counts = countNew(db, destination, viewer.id, now, { rewards, todaySeen: Boolean(store.get(TODAY_SEEN_COOKIE)) });
  const channels = destination.listChannels(viewer.id);
  const feed = recentFeed(channels, (channelId) => destination.listPosts(viewer.id, channelId), FEED_LIMIT);

  // 0-1x：今日の3人と、そのあとの関係のありそうな投稿。生徒には職員室の投稿は来ない（見えるチャネルからだけ選ぶ）
  const todayAll = listTodayCards(
    destination,
    viewer.id,
    now,
    listHiddenIds(db, viewer.id),
    viewerPublicWords(db, destination, viewer.id),
    listCelebratedPostIds(db, now),
    todayAffinity(db, viewer.id, now),
  );
  const todayCards: TodayModalCard[] = [
    ...todayAll.slice(0, FIRST_RANDOM).map((card) => ({ card, related: false })),
    ...todayAll
      .slice(FIRST_RANDOM)
      .filter((card) => card.relatedReason)
      .slice(0, RELATED_LIMIT)
      .map((card) => ({ card, related: true })),
  ].map(({ card, related }) => ({
    postId: card.postId,
    authorId: card.authorId,
    authorName: card.authorName,
    authorLabel: card.authorLabel,
    authorImage: getAvatar(db, card.authorId).image,
    channelName: card.channelName,
    subject: card.subject,
    body: card.body,
    likeCount: card.likeCount,
    liked: card.likedByViewer,
    replyCount: card.replyCount,
    related,
    // 今日の3人にも、理由があれば一言添える（先生で開くと、理由のある生徒の投稿が先に来る）
    reason: card.relatedReason,
    kind: card.kind,
  }));
  // その日はじめて開いたときだけ自動で出す。広い画面の右の欄（iframe）の中でも出す。動画用の早回しでは出さない
  const showToday = todayCards.length > 0 && !store.get(TODAY_SEEN_COOKIE) && hayaokuri !== "1";
  // 帯の左右（裏で読み込んだ画面）では、見せたときに開く（TodayModal がブラウザ側で決める）
  const todayDue = showToday;

  return (
    <TodayProvider initialOpen={showToday} openWhenShown={todayDue}>
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
          chips={
            <ChannelChips
              channels={feedChannels(channels, feed).map(({ id, name }) => ({
                id,
                name,
              }))}
            />
          }
          events={events.map(({ id, name, message, start, end, ribbon }) => ({
            id,
            name,
            message,
            start,
            end,
            ribbon: { name: ribbon.name, description: ribbon.description },
          }))}
          extras={
            // 0-2f(5)：必要なときだけの入口は、札の列の端に小さく
            <>
              {eggs > 0 && (
                <Link className="minna-extra" href="/me?open=collect" aria-label="贈り物の卵が届いています">
                  <Icon name="gift" />
                </Link>
              )}
              {hasAlerts && (
                <Link className="minna-extra" href="/soudan" aria-label="相談室への知らせを見る">
                  <Icon name="shield" />
                </Link>
              )}
              {isKohoOfficer(viewer.id) && (
                <Link className="minna-extra" href="/koho" aria-label="広報の候補">
                  <Icon name="star" />
                </Link>
              )}
            </>
          }
          dock={
            // 0-2f(1)：入口は、いちばん下に固定したアイコンの帯の1か所だけ（Teams の下の帯のように）
            <nav className="minna-dock" aria-label="みんなの入口" data-noswipe>
              <TodayEntrance badge={counts.today} />
              <Link className="minna-dock-item" href="/inbox">
                <Icon name="inbox" />
                <span>受信箱</span>
                {counts.inbox > 0 && <span className="minna-dock-badge">{counts.inbox}</span>}
              </Link>
              <Link className="minna-dock-item" href="/study/room" aria-label="自習室（一緒に勉強する）">
                <Icon name="book" />
                <span>自習室</span>
              </Link>
              <Link className="minna-dock-item" href="/chie">
                <Icon name="idea" />
                <span>
                  校内の<wbr />
                  知恵
                </span>
              </Link>
              {/* アプリの中の校内チャネルの画面ではなく、本物の Teams を開く。つないでいないときは置かない（0-2q(6)） */}
              {teamsLink && (
                <a className="minna-dock-item" href={teamsLink} target="_blank" rel="noopener noreferrer" aria-label="Teams を開く">
                  <Icon name="chat" />
                  <span>Teams</span>
                </a>
              )}
            </nav>
          }
        >
          {feed.length > 0 ? (
            <FilteredList label="最近の投稿と返事">
              {feed.map(({ post, channel, activeAt }) => (
                <FilteredItem key={post.id} channelId={channel.id}>
                  <article className="minna-post" {...cardAttr(post.subject)} aria-label={`${post.authorName}さんの投稿`}>
                    <header className="minna-post-head">
                      <strong>{post.authorName}</strong>
                      <span className="minna-post-role">{post.authorLabel}</span>
                      <small>
                        {channel.name}・{shortAgo(activeAt, now)}
                      </small>
                    </header>
                    <PostSubject subject={post.subject} className="minna-post-subject" />
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
                            {/* 助けてもらった場所：自分の投稿への返事にだけ置く */}
                            {post.authorId === viewer.id && reply.authorId !== viewer.id && <ThanksEntry person={{ id: reply.authorId, name: reply.authorName, label: reply.authorLabel }} />}
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
                    <PostThanks post={post} viewerId={viewer.id} />
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
        </MinnaFrame>
      </ChannelFilter>
      <TodayModal cards={todayCards} />
    </TodayProvider>
  );
}

/** 0-2j：頑張りの投稿には「おめでとう」、お知らせや報告には「ありがとう」。困りごとの投稿には置かない（返事で応える） */
function PostThanks({ post, viewerId }: { post: PostView; viewerId: string }) {
  if (post.authorId === viewerId) return null;
  const label = thanksEntryLabel(post.kind);
  if (!label) return null;
  return <ThanksEntry person={{ id: post.authorId, name: post.authorName, label: post.authorLabel }} label={label} />;
}
