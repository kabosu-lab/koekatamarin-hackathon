import { wornTitle } from "@/lib/titles";
import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { getDestination } from "@/lib/destination/current";
import { listHiddenIds } from "@/lib/hidden-people";
import { listCelebratedPostIds } from "@/lib/goals";
import { listPopularCards, listQuietPosts, listSeenNotes, listTodayCards, viewerPublicWords, todayAffinity } from "@/lib/today";
import { CardReply } from "./CardReply";
import { TodayCards } from "./TodayCards";

import { PageShell } from "@/app/ui/PageShell";
export const metadata: Metadata = { title: "今日の3人｜こえかた" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { viewer } = await getViewer();
  const { view } = await searchParams;
  const popular = view === "popular";

  const db = getDatabase();
  const teams = getDestination(db);
  const now = new Date();
  const hidden = listHiddenIds(db, viewer.id);
  const cards = popular ? listPopularCards(teams, viewer.id, hidden) : listTodayCards(teams, viewer.id, now, hidden, viewerPublicWords(db, teams, viewer.id), listCelebratedPostIds(db, now), todayAffinity(db, viewer.id, now));
  const seen = listSeenNotes(db, viewer.id, now);
  const quiet = listQuietPosts(db, teams, viewer.id, now);

  return (
    <PageShell back={{ href: "/minna", label: "みんな" }} title="今日の3人" lead="10秒で、誰かの頑張りを応援できます。">

      {seen.map((note) => (
        <p className="seen-note" key={note.postBody}>
          {note.seenBy.join("さん、")}さんが、あなたの投稿を見てくれました：「{note.postBody}」
        </p>
      ))}

      {quiet.map((post) => (
        <div className="quiet-note" key={post.postId}>
          {post.authorName}さんの投稿に、まだ反応がありません。一言どうですか？「{post.body}」{" "}
          <Link href={`/teams?channel=${post.channelId}`}>校内チャネルで見る</Link>
          <CardReply postId={post.postId} label="一言話して返す" />
        </div>
      ))}

      <nav className="today-tabs" aria-label="カードの選び方">
        <Link href="/today" aria-current={popular ? undefined : "page"}>
          今日の3人
        </Link>
        <Link href="/today?view=popular" aria-current={popular ? "page" : undefined}>
          人気の投稿
        </Link>
      </nav>

      <TodayCards
        key={`${viewer.id}-${popular ? "popular" : "today"}`}
        cards={cards.map((card) => ({ ...card, authorImage: getAvatar(db, card.authorId).image, authorTitle: wornTitle(db, card.authorId) }))}
      />
    </PageShell>
  );
}
