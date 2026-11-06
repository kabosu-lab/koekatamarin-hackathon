import { getDatabase } from "@/lib/db";
import { changeRoomMusic, getRoomMusic } from "@/lib/room-music";
import { ensureDemoCompanions } from "@/lib/study";

/** 一緒に聴いている人の数は、自習室の画面と同じ数え方にそろえる */
function prepare(now: Date) {
  const db = getDatabase();
  ensureDemoCompanions(db, now);
  return db;
}

export async function GET() {
  const now = new Date();
  return Response.json(getRoomMusic(prepare(now), now));
}

export async function POST() {
  const now = new Date();
  return Response.json(changeRoomMusic(prepare(now), now));
}
