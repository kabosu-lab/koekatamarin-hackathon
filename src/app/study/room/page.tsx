import type { Metadata } from "next";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { seasonOf } from "@/lib/sakura";
import { ensureDemoCompanions, findOwnSession, getPresence } from "@/lib/study";
import { getRoomMusic } from "@/lib/room-music";
import { PageShell } from "@/app/ui/PageShell";
import { StudyTimer } from "../StudyTimer";
import { Refresher } from "./Refresher";
import { RoomMusic } from "./RoomMusic";
import { RoomScene } from "./RoomScene";
import { roomMoment } from "./scene";
import "./room.css";

export const metadata: Metadata = { title: "自習室（一緒に勉強する）｜こえかた" };
export const dynamic = "force-dynamic";

/**
 * 自習室（一緒に勉強する）。前の /study と1つにまとめた（0-1u (6)）。
 * 景色には人数とパートナーだけ。その下に自分の25分のタイマーと、みんなで聴く曲。配信もない。Teams のタブには /tab を置く。
 */
export default async function StudyRoomPage({ searchParams }: { searchParams: Promise<{ time?: string | string[] }> }) {
  const { time: requested } = await searchParams;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);
  const presence = getPresence(db, now);
  const moment = roomMoment(now, requested);

  return (
    <PageShell
      back={{ href: "/minna", label: "みんな" }}
      title="自習室（一緒に勉強する）"
      lead="話さなくて大丈夫。誰かが頑張っている気配だけ。"
      className="room-page"
    >
      <section className="card room-card" aria-label="自習室">
        <p className="study-count">いま {presence.count} 人が勉強しています</p>
        <RoomScene tokens={presence.tokens} moment={moment} season={seasonOf(now)} />
      </section>
      {/* 夜遅くに休むのをすすめる文は、タイマーの中の1か所だけに出す */}
      <StudyTimer key={viewer.id} initialSession={findOwnSession(db, viewer.id, now)} initialLateNight={moment.late} />
      <RoomMusic initial={getRoomMusic(db, now)} />
      <Refresher />
    </PageShell>
  );
}
