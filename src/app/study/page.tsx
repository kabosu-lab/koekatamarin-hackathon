import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { ensureDemoCompanions, findOwnSession, getPresence, isLateNight } from "@/lib/study";
import { StudyTimer } from "./StudyTimer";

import { BackLink } from "@/app/BackLink";
export const metadata: Metadata = { title: "一緒に勉強する｜こえかた" };
export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);

  return (
    <main className="home">
      <BackLink href="/minna">みんなへもどる</BackLink>
      <header>
        <h1>一緒に勉強する</h1>
        <p>話さなくて大丈夫。誰かが頑張っている気配だけ。</p>
      </header>
      <StudyTimer
        key={viewer.id}
        initialSession={findOwnSession(db, viewer.id, now)}
        initialPresence={getPresence(db, now)}
        initialLateNight={isLateNight(now)}
      />
    </main>
  );
}
