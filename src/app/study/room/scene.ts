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
