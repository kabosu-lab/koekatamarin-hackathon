import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { ensureDemoCompanions, getPresence } from "@/lib/study";
import { PresenceView } from "../PresenceView";
import { Refresher } from "./Refresher";

export const metadata: Metadata = { title: "自習室｜こえかた" };
export const dynamic = "force-dynamic";

/** Teams のチャネルのタブに置く画面。人数と相棒の情報だけで動き、操作も配信もない。 */
export default function StudyRoomPage() {
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);

  return (
    <main className="home">
      <h1>自習室</h1>
      <section className="card" aria-label="自習室">
        <PresenceView presence={getPresence(db, now)} />
      </section>
      <Refresher />
    </main>
  );
}
