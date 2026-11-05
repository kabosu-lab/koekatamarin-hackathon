import { describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { beatAt, changeRoomMusic, CHANGE_INTERVAL_MS, getRoomMusic, notesForBeat, TRACKS, trackOf } from "./room-music";

const NOW = new Date("2026-11-06T01:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("自習室の音楽", () => {
  it("同じ時刻なら誰でも同じ拍の同じ音になる", () => {
    const track = TRACKS[0];
    const beat = beatAt(track, NOW.getTime());
    expect(beatAt(track, NOW.getTime())).toBe(beat);
    expect(notesForBeat(track, beat)).toEqual(notesForBeat(track, beat));
    expect(notesForBeat(track, beat + 32)).toEqual(notesForBeat(track, beat));
  });

  it("どの曲にも音があり、休みが多い", () => {
    for (const track of TRACKS) {
      const beats = Array.from({ length: 32 }, (_, beat) => notesForBeat(track, beat));
      expect(beats.some((notes) => notes.chord)).toBe(true);
      expect(beats.some((notes) => notes.melody)).toBe(true);
      expect(beats.filter((notes) => !notes.chord && !notes.melody).length).toBeGreaterThan(16);
    }
  });

  it("誰かが切り替えると全員の曲が変わり、少し間を置くまで変わらない", () => {
    const db = openDatabase(":memory:");
    expect(getRoomMusic(db, NOW)).toMatchObject({ trackId: TRACKS[0].id, canChange: true });
    const changed = changeRoomMusic(db, NOW);
    expect(changed).toMatchObject({ trackId: TRACKS[1].id, canChange: false });
    expect(getRoomMusic(db, later(1000)).trackId).toBe(TRACKS[1].id);
    expect(changeRoomMusic(db, later(1000)).trackId).toBe(TRACKS[1].id);
    expect(changeRoomMusic(db, later(CHANGE_INTERVAL_MS)).trackId).toBe(TRACKS[2].id);
    // 誰が切り替えたかを残さない
    expect(db.prepare("SELECT * FROM room_music").get()).not.toHaveProperty("person_id");
  });

  it("知らない曲は最初の曲に戻す", () => {
    expect(trackOf("evil")).toBe(TRACKS[0]);
  });
});
