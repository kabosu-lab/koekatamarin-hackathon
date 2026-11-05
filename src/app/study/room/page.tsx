import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { seasonOf } from "@/lib/sakura";
import { ensureDemoCompanions, getPresence } from "@/lib/study";
import { getRoomMusic } from "@/lib/room-music";
import { Refresher } from "./Refresher";
import { RoomMusic } from "./RoomMusic";
import { RoomScene } from "./RoomScene";
import { roomMoment } from "./scene";
import "./room.css";

export const metadata: Metadata = { title: "自習室｜こえかた" };
export const dynamic = "force-dynamic";

/** Teams のチャネルのタブに置く画面。人数と相棒の情報だけで動き、操作も配信もない。 */
export default async function StudyRoomPage({ searchParams }: { searchParams: Promise<{ time?: string | string[] }> }) {
  const { time: requested } = await searchParams;
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);
  const presence = getPresence(db, now);
  const moment = roomMoment(now, requested);

  return (
    <main className="home room-page">
      <h1>自習室</h1>
      <section className="card room-card" aria-label="自習室">
        <p className="study-count">いま {presence.count} 人が勉強しています</p>
        <RoomScene tokens={presence.tokens} moment={moment} season={seasonOf(now)} />
      </section>
      {moment.late && <p className="room-rest">もう遅い時間です。今日はここまでにして、休みませんか。</p>}
      <RoomMusic initial={getRoomMusic(db, now)} />
      <Refresher />
    </main>
  );
}
