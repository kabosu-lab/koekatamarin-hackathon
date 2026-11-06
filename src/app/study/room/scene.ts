import { type TimeOfDay, timeOfDay } from "@/lib/sakura";
import { isLateNight } from "@/lib/study";

export type RoomPlace = "library" | "garden" | "classroom" | "cafe";

/** 朝は図書館、昼は校庭の桜の下、夕方は教室、夜はカフェ。 */
export const ROOM_PLACES: Record<TimeOfDay, { place: RoomPlace; label: string }> = {
  morning: { place: "library", label: "朝の図書館" },
  day: { place: "garden", label: "昼の校庭の桜の下" },
  evening: { place: "classroom", label: "夕方の教室" },
  night: { place: "cafe", label: "夜のカフェ" },
};

export type RoomMoment = { time: TimeOfDay; late: boolean };

/**
 * いつの景色を見せるか。ふだんは東京の時刻で決まる。
 * 撮影と画面テストのために `?time=` で選べる（`late` は夜遅く）。知らない値は無視する。
 */
export function roomMoment(now: Date, requested?: string | string[]): RoomMoment {
  if (requested === "late") return { time: "night", late: true };
  if (typeof requested === "string" && Object.hasOwn(ROOM_PLACES, requested)) {
    return { time: requested as TimeOfDay, late: false };
  }
  return { time: timeOfDay(now), late: isLateNight(now) };
}

/** パートナーは2人ずつ、同じ机に座る。端数のパートナーの机には、空いた席が1つ残る。 */
export function roomTables(tokens: string[]): string[][] {
  const tables: string[][] = [];
  for (let index = 0; index < tokens.length; index += 2) tables.push(tokens.slice(index, index + 2));
  return tables;
}

/** 景色の中に座れるのはここまで。超えた分は奥のぼかした影と「ほか N人」の札にまとめる（0-2s） */
export const ROOM_SEATS = 12;
/** `?people=` で見せられる人数の上限（撮影と画面テスト用） */
const PEOPLE_MAX = 60;

/**
 * 人数を変えて景色を見る（撮影と画面テストのため。`?time=` と同じく見た目だけで、記録は増やさない）。
 * いまいるパートナーの絵をくり返して、指定の人数にする。知らない値や、誰もいない部屋では、そのまま返す。
 */
export function roomPeople(
  presence: { count: number; tokens: string[] },
  requested?: string | string[],
): { count: number; tokens: string[] } {
  if (typeof requested !== "string" || !/^\d{1,3}$/.test(requested) || presence.tokens.length === 0) return presence;
  const count = Math.min(PEOPLE_MAX, Math.max(1, Number(requested)));
  return { count, tokens: Array.from({ length: count }, (_, index) => presence.tokens[index % presence.tokens.length]) };
}

/** 席の並べ方の段。人が増えるほど机の列を増やし、キャラクターを小さくする（room.css の data-crowd） */
export function roomCrowd(seated: number): "few" | "some" | "many" | "full" {
  if (seated <= 2) return "few";
  if (seated <= 6) return "some";
  if (seated <= 10) return "many";
  return "full";
}
