import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { getDestination } from "@/lib/destination/current";
import { listHiddenIds } from "@/lib/hidden-people";
import { listPopularCards, listQuietPosts, listSeenNotes, listTodayCards, viewerPublicWords } from "@/lib/today";
import { PersonSwitcher } from "../PersonSwitcher";
import { TodayCards } from "./TodayCards";

export const metadata: Metadata = { title: "今日の3人｜こえかた" };
export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { viewer, people } = await getViewer();
  const { view } = await searchParams;
  const popular = view === "popular";

  const db = getDatabase();
  const teams = getDestination(db);
  const now = new Date();
  const hidden = listHiddenIds(db, viewer.id);
  const cards = popular ? listPopularCards(teams, viewer.id, hidden) : listTodayCards(teams, viewer.id, now, hidden, viewerPublicWords(db, teams, viewer.id));
  const seen = listSeenNotes(db, viewer.id, now);
  const quiet = listQuietPosts(db, teams, viewer.id, now);

  return (
    <main className="home">
      <header>
        <h1>今日の3人</h1>
        <p>10秒で、誰かの頑張りを応援できます。</p>
        <PersonSwitcher viewerId={viewer.id} people={people} />
      </header>

      {seen.map((note) => (
        <p className="seen-note" key={note.postBody}>
          {note.seenBy.join("さん、")}さんが、あなたの投稿を見てくれました：「{note.postBody}」
        </p>
      ))}

      {quiet.map((post) => (
        <p className="quiet-note" key={post.postId}>
          {post.authorName}さんの投稿に、まだ反応がありません。一言どうですか？「{post.body}」{" "}
          <Link href={`/teams?channel=${post.channelId}`}>校内チャネルで見る</Link>
        </p>
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
        cards={cards.map((card) => ({ ...card, authorImage: getAvatar(db, card.authorId).image }))}
      />

      <p className="staff-link">
        <Link href="/">もどる</Link>
      </p>
    </main>
  );
}
