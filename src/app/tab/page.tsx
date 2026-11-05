import type { Metadata } from "next";
import { getDatabase } from "@/lib/db";
import { getSakura, leavesThisWeek, seasonOf } from "@/lib/sakura";
import { ensureDemoCompanions, getPresence } from "@/lib/study";
import { RoomScene } from "../study/room/RoomScene";
import { roomMoment } from "../study/room/scene";
import "../study/room/room.css";

export const metadata: Metadata = { title: "校内のようす｜こえかた" };
export const dynamic = "force-dynamic";

/**
 * Teams のチャネルのタブに置く画面。校内の桜と自習室だけを見せる。
 * 人数とパートナーだけで、名前も投稿の本文も出さず、操作もない。誰が見ても同じ。
 */
export default async function TabPage() {
  const db = getDatabase();
  const now = new Date();
  ensureDemoCompanions(db, now);
  const sakura = getSakura(db, now);
  const presence = getPresence(db, now);
  return (
    <main className="home room-page">
      <h1>校内のようす</h1>
      <section className="sakura-line" aria-label="校内の桜">
        <strong>校内の桜</strong>
        <span>{sakura.message}</span>
        <small>
          今週 {leavesThisWeek(db, now)} 枚の葉が増えました（今年 {sakura.leaves} 枚）
        </small>
      </section>
      <section className="card room-card" aria-label="自習室">
        <p className="study-count">いま {presence.count} 人が勉強しています</p>
        <RoomScene tokens={presence.tokens} moment={roomMoment(now)} season={seasonOf(now)} />
      </section>
    </main>
  );
}
