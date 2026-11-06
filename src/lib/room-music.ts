import type { DatabaseSync } from "node:sqlite";
import { TRACKS, type TrackId, trackOf } from "./music/tracks";
import { getPresence } from "./study";

export { loopMs, loopPosition, TRACKS, type Track, trackOf } from "./music/tracks";

/**
 * 自習室の音楽。曲はコードで作り、サーバーの時刻を基準に全員が同じ位置を聴く。
 * 誰かが切り替えると全員の曲が変わる。誰が切り替えたかは残さない。
 * 争いにならないよう、切り替えのあとは少し間を置く。
 */
export const CHANGE_INTERVAL_MS = 60_000;

export type RoomMusic = {
  trackId: TrackId;
  name: string;
  serverNow: number;
  canChange: boolean;
  /** いま一緒に聴いている人の数。自習室の在室の数え方を使い、誰かは出さない */
  listening: number;
};

function readRow(db: DatabaseSync): { track: string; changed_at: number } {
  return (db.prepare("SELECT track, changed_at FROM room_music WHERE id = 1").get() as { track: string; changed_at: number } | undefined) ?? { track: TRACKS[0].id, changed_at: 0 };
}

export function getRoomMusic(db: DatabaseSync, now: Date): RoomMusic {
  const row = readRow(db);
  const track = trackOf(row.track);
  return {
    trackId: track.id,
    name: track.name,
    serverNow: now.getTime(),
    canChange: now.getTime() - row.changed_at >= CHANGE_INTERVAL_MS,
    listening: getPresence(db, now).count,
  };
}

/** 次の曲へ切り替える。間を置く前なら変えない。 */
export function changeRoomMusic(db: DatabaseSync, now: Date): RoomMusic {
  const current = getRoomMusic(db, now);
  if (!current.canChange) return current;
  const index = TRACKS.findIndex((track) => track.id === current.trackId);
  const next = TRACKS[(index + 1) % TRACKS.length];
  db.prepare(
    `INSERT INTO room_music (id, track, changed_at) VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET track = excluded.track, changed_at = excluded.changed_at`,
  ).run(next.id, now.getTime());
  return getRoomMusic(db, now);
}
