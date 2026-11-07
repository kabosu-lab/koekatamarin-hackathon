import { wornTitle } from "@/lib/titles";
import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getAvatar } from "@/lib/avatar";
import { getDestination } from "@/lib/destination/current";
import { listHiddenIds } from "@/lib/hidden-people";
import { listCelebratedPostIds } from "@/lib/goals";
import { listPopularCards, listSeenNotes, listTodayCards, viewerPublicWords, todayAffinity } from "@/lib/today";
import { TodayCards } from "./TodayCards";
import { MarkTodaySeen } from "../minna/TodayModal";

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
  const cards = popular ? listPopularCards(teams, viewer.id, hidden) : listTodayCards(teams, viewer.id, now, hidden, viewerPublicWords(db, teams, viewer.id), listCelebratedPostIds(db, now), todayAffinity(db, viewer.id, now, teams));
  const seen = listSeenNotes(db, viewer.id, now);

  return (
    <PageShell back={{ href: "/minna", label: "みんな" }} title="今日の3人" lead="10秒で、誰かの頑張りを応援できます。">
      <MarkTodaySeen />

      {seen.map((note) => (
        <p className="seen-note" key={note.postBody}>
          {note.seenBy.join("さん、")}さんが、あなたの投稿を見てくれました：「{note.postBody}」
        </p>
      ))}

      {/* 0-3p(1)：まだ反応のない投稿は別枠にせず、見た目を変えずに今日の3人の中へ混ぜる（todayAffinity） */}

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
        polite={viewer.role !== "student"}
        cards={cards.map((card) => ({ ...card, authorImage: getAvatar(db, card.authorId).image, authorTitle: wornTitle(db, card.authorId) }))}
      />
    </PageShell>
  );
}
