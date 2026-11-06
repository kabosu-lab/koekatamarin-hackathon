/**
 * 自習室の曲の表。ブラウザでもサーバーでも読むので、データベースや Web Audio を持ち込まない。
 * 曲は動画のために作った3曲を、自習室で途切れずに回るよう組み直したもの（./arrange.ts）。
 * どれも 16 小節でひと回りし、終わりが頭につながる。
 */
export const TRACKS = [
  { id: "piano", name: "窓辺のピアノ", bpm: 96, bars: 16, seed: 20261106 },
  { id: "epiano", name: "放課後のエレピ", bpm: 96, bars: 16, seed: 20261107 },
  { id: "pluck", name: "木もれ日の木琴", bpm: 96, bars: 16, seed: 20261108 },
] as const;

export type Track = (typeof TRACKS)[number];
export type TrackId = Track["id"];

/** 知らない曲は最初の曲に戻す */
export function trackOf(id: unknown): Track {
  return TRACKS.find((track) => track.id === id) ?? TRACKS[0];
}

/** ひと回りの長さ（ミリ秒） */
export function loopMs(track: Track): number {
  return (track.bars * 4 * 60_000) / track.bpm;
}

/** その時刻に、ひと回りのどこを鳴らすか（秒）。全員が同じサーバーの時刻から計算するので、同じ位置を聴く */
export function loopPosition(track: Track, serverMs: number): number {
  const length = loopMs(track);
  return (((serverMs % length) + length) % length) / 1000;
}
