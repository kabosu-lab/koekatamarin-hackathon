import type { Metadata } from "next";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { seasonOf } from "@/lib/sakura";
import { ensureDemoCompanions, findOwnSession, getPresence, getStudyMates } from "@/lib/study";
import { getRoomMusic } from "@/lib/room-music";
import { PageShell } from "@/app/ui/PageShell";
import { StudyTimer } from "../StudyTimer";
import { Refresher } from "./Refresher";
import { RoomHint } from "./RoomHint";
import { RoomMusic } from "./RoomMusic";
import { RoomPeople } from "./RoomPeople";
import { RoomScene } from "./RoomScene";
import { ROOM_SEATS, roomMoment, roomPeople } from "./scene";
import { isTrialMode } from "@/lib/trial";

/** ?people= で見せかけの人数を作れるのは、台本モード（動画）とテストのときだけ。試用版と本物の Claude のときは無視する */
function allowsPeopleOverride(): boolean {
  return !isTrialMode() && (process.env.KOEKATA_CLAUDE === "scripted" || !process.env.ANTHROPIC_API_KEY);
}
import "./room.css";

export const metadata: Metadata = { title: "自習室（一緒に勉強する）｜こえかた" };
export const dynamic = "force-dynamic";

/**
 * 自習室（一緒に勉強する）。前の /study と1つにまとめた（0-1u (6)）。
 * 1画面に収め、スクロールさせない（0-2s）：景色を残りの高さいっぱいに広げ、上の端に人数と曲の札、下の端に自分の25分のタイマーを重ねる。
 * 景色には人数とパートナーだけ。配信もない。Teams のタブには /tab を置く。
 */
export default async function StudyRoomPage({
  searchParams,
}: {
  searchParams: Promise<{ time?: string | string[]; people?: string | string[] }>;
}) {
  const { time: requested, people } = await searchParams;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);
  const presence = roomPeople(getPresence(db, now), allowsPeopleOverride() ? people : undefined);
  const moment = roomMoment(now, requested);
  // 押したパートナーの名札（0-3f）。景色の並びと同じ順にそろえる（見せかけの人数のときは、いる人をくり返す）
  const mates = getStudyMates(db, now);
  const seatMates = mates.length === 0 ? [] : presence.tokens.map((_, index) => mates[index % mates.length]);

  return (
    <PageShell back={{ href: "/minna", label: "みんな" }} title="自習室" className="room-page room-fit">
      <div className="room-stage">
        {/* 大きさの入れ物は、残りの高さに広げた枠の中に絶対配置で置く（伸び縮みの段の入れ物では cqh が 0 になる） */}
        <div className="room-frame">
          <RoomPeople mates={seatMates} seats={ROOM_SEATS} viewerId={viewer.id}>
            <section className="room-card" aria-label="自習室">
              <p className="study-count room-chip">
                いま {presence.count} 人<span className="visually-hidden">が勉強しています</span>
              </p>
              <RoomScene tokens={presence.tokens} moment={moment} season={seasonOf(now)} pressable />
            </section>
          </RoomPeople>
          <RoomHint text="話さなくて大丈夫。誰かが頑張っている気配だけ。" />
          <RoomMusic initial={getRoomMusic(db, now)} />
          {/* 夜遅くに休むのをすすめる文は、タイマーの中の1か所だけに出す */}
          <div className="room-band">
            <StudyTimer key={viewer.id} initialSession={findOwnSession(db, viewer.id, now)} initialLateNight={moment.late} />
          </div>
        </div>
      </div>
      <Refresher />
    </PageShell>
  );
}
