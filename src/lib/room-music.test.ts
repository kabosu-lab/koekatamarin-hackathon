import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { renderLoop } from "./music/arrange";
import { changeRoomMusic, CHANGE_INTERVAL_MS, getRoomMusic, loopMs, loopPosition, TRACKS, trackOf } from "./room-music";
import { seedDatabase } from "./seed";
import { ensureDemoCompanions, getPresence } from "./study";

const NOW = new Date("2026-11-06T01:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
/** テストは粗い音で十分。軽く作る */
const RATE = 8000;

describe("自習室の音楽", () => {
  it("曲は3つで、名前と、30〜60秒のひと回りがある", () => {
    expect(TRACKS).toHaveLength(3);
    expect(new Set(TRACKS.map((track) => track.name)).size).toBe(3);
    for (const track of TRACKS) {
      expect(loopMs(track)).toBeGreaterThanOrEqual(30_000);
      expect(loopMs(track)).toBeLessThanOrEqual(60_000);
    }
  });

  it("同じ時刻なら誰でもひと回りの同じ位置を聴き、ひと回りすると頭に戻る", () => {
    const track = TRACKS[0];
    const at = loopPosition(track, NOW.getTime());
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThan(loopMs(track) / 1000);
    expect(loopPosition(track, NOW.getTime() + loopMs(track))).toBeCloseTo(at, 6);
  });

  it.each(TRACKS.map((track) => [track.id, track] as const))("%s は乱数を使っても、誰の端末でも同じ音になり、途切れずに回る", (id, track) => {
    const first = renderLoop(id, RATE);
    const second = renderLoop(id, RATE);
    expect(first.L.length).toBe(Math.round((loopMs(track) / 1000) * RATE));
    expect(first.L).toEqual(second.L);
    expect(first.R).toEqual(second.R);

    let peak = 0;
    let silent = 0;
    for (let i = 0; i < first.L.length; i++) {
      const level = Math.max(Math.abs(first.L[i]), Math.abs(first.R[i]));
      peak = Math.max(peak, level);
      if (level < 1e-4) silent += 1;
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
    // 無音の区間を作らない（動画用の版の無音は抜いた）
    expect(silent / first.L.length).toBeLessThan(0.01);
    // 終わりから頭へのつなぎ目で、ぷつっと跳ばない（ふだんの隣どうしの差より大きく跳ばない）
    const n = first.L.length;
    let largest = 0;
    for (let i = 1; i < n; i++) largest = Math.max(largest, Math.abs(first.L[i] - first.L[i - 1]));
    expect(Math.abs(first.L[0] - first.L[n - 1])).toBeLessThanOrEqual(largest);
    // 頭は無音から始まらない（終わりの響きが頭につながっている）
    expect(Math.abs(first.L[0]) + Math.abs(first.R[0])).toBeGreaterThan(0);
  });

  it("誰かが切り替えると全員の曲が変わり、少し間を置くまで変わらない", () => {
    const db = openDatabase(":memory:");
    expect(getRoomMusic(db, NOW)).toMatchObject({ trackId: TRACKS[0].id, canChange: true });
    const changed = changeRoomMusic(db, NOW);
    expect(changed).toMatchObject({ trackId: TRACKS[1].id, name: TRACKS[1].name, canChange: false });
    expect(getRoomMusic(db, later(1000)).trackId).toBe(TRACKS[1].id);
    expect(changeRoomMusic(db, later(1000)).trackId).toBe(TRACKS[1].id);
    expect(changeRoomMusic(db, later(CHANGE_INTERVAL_MS)).trackId).toBe(TRACKS[2].id);
    // 誰が切り替えたかを残さない
    expect(db.prepare("SELECT * FROM room_music").get()).not.toHaveProperty("person_id");
  });

  it("一緒に聴いている人の数は、自習室の在室の数と同じで、数だけを返す", () => {
    const db = openDatabase(":memory:");
    seedDatabase(db);
    expect(getRoomMusic(db, NOW).listening).toBe(0);
    ensureDemoCompanions(db, NOW);
    const music = getRoomMusic(db, NOW);
    expect(music.listening).toBe(getPresence(db, NOW).count);
    expect(music.listening).toBeGreaterThan(0);
    expect(Object.keys(music).sort()).toEqual(["canChange", "listening", "name", "serverNow", "trackId"]);
  });

  it("知らない曲は最初の曲に戻す（前の曲の名前が残っていても）", () => {
    expect(trackOf("evil")).toBe(TRACKS[0]);
    expect(trackOf("morning")).toBe(TRACKS[0]);
  });
});
