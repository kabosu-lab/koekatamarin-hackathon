import type { DatabaseSync } from "node:sqlite";

/**
 * 自習室の音楽。曲はコードで作り、サーバーの時刻を基準に全員が同じ位置を聴く。
 * 誰かが切り替えると全員の曲が変わる。誰が切り替えたかは残さない。
 * 争いにならないよう、切り替えのあとは少し間を置く。
 */
export const CHANGE_INTERVAL_MS = 60_000;

/** 和音は音の高さ（MIDI の番号）。1小節4拍で順に鳴らす。 */
export const TRACKS = [
  {
    id: "morning",
    name: "朝の窓辺",
    bpm: 66,
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]],
    melody: [76, 74, 72, 67, 69, 72, 74, 72],
  },
  {
    id: "rain",
    name: "雨の図書室",
    bpm: 58,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
    melody: [72, 71, 69, 64, 65, 67, 69, 64],
  },
  {
    id: "night",
    name: "夜のカフェ",
    bpm: 72,
    chords: [[62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71], [57, 60, 64, 67]],
    melody: [74, 72, 69, 72, 76, 74, 72, 69],
  },
] as const;

export type Track = (typeof TRACKS)[number];
export type RoomMusic = { trackId: Track["id"]; name: string; serverNow: number; canChange: boolean };

export function trackOf(id: unknown): Track {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}

export type BeatNotes = { chord: readonly number[] | null; melody: number | null };

/** その時刻が何拍目か。全員が同じ時刻から計算するので、同じ位置を聴く。 */
export function beatAt(track: Track, serverMs: number): number {
  return Math.floor(serverMs / (60_000 / track.bpm));
}

/** 拍から鳴らす音を決める。乱数を使わないので、誰の端末でも同じになる。 */
export function notesForBeat(track: Track, beat: number): BeatNotes {
  const position = ((beat % 32) + 32) % 32;
  const chord = position % 8 === 0 ? track.chords[(position / 8) % track.chords.length] : null;
  // 休みを多くして、勉強の邪魔をしない
  const melody = position % 4 === 2 ? track.melody[Math.floor(position / 4) % track.melody.length] : null;
  return { chord, melody };
}

function readRow(db: DatabaseSync): { track: string; changed_at: number } {
  return (db.prepare("SELECT track, changed_at FROM room_music WHERE id = 1").get() as { track: string; changed_at: number } | undefined) ?? { track: TRACKS[0].id, changed_at: 0 };
}

export function getRoomMusic(db: DatabaseSync, now: Date): RoomMusic {
  const row = readRow(db);
  const track = trackOf(row.track);
  return { trackId: track.id, name: track.name, serverNow: now.getTime(), canChange: now.getTime() - row.changed_at >= CHANGE_INTERVAL_MS };
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
