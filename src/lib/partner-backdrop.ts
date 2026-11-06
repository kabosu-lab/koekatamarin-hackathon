import { partnerHour, timeOfDay } from "./partner-lines";
import { type Season, seasonOf } from "./sakura";

/**
 * パートナーの窓の背景（0-2x）。時間（朝・昼・夕・夜）と場所（教室・校庭・廊下・図書室）と、まれに出るレアな背景。
 * 乱数は使わず、日本時間の日付から決める（同じ日は同じ場所。サーバーと画面で食い違わない）。
 */
export type BackdropTime = "morning" | "noon" | "evening" | "night";
export type BackdropPlace = "classroom" | "schoolyard" | "hallway" | "library";
export type BackdropRare = "sakura" | "snow" | "rainbow" | "shooting-star" | "festival";

export const BACKDROP_TIMES: readonly BackdropTime[] = ["morning", "noon", "evening", "night"];
export const BACKDROP_PLACES: readonly BackdropPlace[] = ["classroom", "schoolyard", "hallway", "library"];
export const BACKDROP_RARES: readonly BackdropRare[] = ["sakura", "snow", "rainbow", "shooting-star", "festival"];

export const PLACE_LABELS: Record<BackdropPlace, string> = {
  classroom: "教室",
  schoolyard: "校庭",
  hallway: "廊下",
  library: "図書室",
};

export const RARE_LABELS: Record<BackdropRare, string> = {
  sakura: "桜吹雪",
  snow: "雪",
  rainbow: "虹",
  "shooting-star": "流れ星",
  festival: "文化祭の飾り",
};

/** レアが出たときの一言。生徒には気さくに、先生にはです・ます調で。問いかけにせず言い切る（吹き出しの問いは1つだけ。0-1r） */
const RARE_LINES: Record<BackdropRare, { student: string; teacher: string }> = {
  sakura: { student: "今日は桜吹雪だよ。きれいだね", teacher: "今日は桜吹雪が舞っています" },
  snow: { student: "雪が降ってきたよ。あったかくしてね", teacher: "雪が降ってきました。あたたかくしてくださいね" },
  rainbow: { student: "今日は虹が出てるよ", teacher: "今日は虹が出ています" },
  "shooting-star": { student: "流れ星が出てるよ", teacher: "流れ星が見えました" },
  festival: { student: "文化祭の飾りが出てるよ。わくわくするね", teacher: "文化祭の飾りが出ています" },
};

/** およそ何日に1日、レアが出るか（100 のうち） */
const RARE_PER_100 = 8;

export type Backdrop = { time: BackdropTime; place: BackdropPlace; rare: BackdropRare | null };
export type BackdropOverride = { time?: BackdropTime; place?: BackdropPlace; rare?: BackdropRare | null };

/** 日本時間の時から、背景の時間。放課後（15〜17時台）は夕方にする */
export function backdropTime(hour: number): BackdropTime {
  const t = timeOfDay(hour);
  return t === "afterschool" ? "evening" : t;
}

/** 日本時間の日付（YYYY-MM-DD） */
export function backdropDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 文字から決まる数（FNV-1a）。同じ文字なら同じ数 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 日替わりの場所。日の通し番号で順に回すので、前の日と同じ場所は続かない */
export function backdropPlace(dateKey: string): BackdropPlace {
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  const n = BACKDROP_PLACES.length;
  return BACKDROP_PLACES[((day % n) + n) % n];
}

/** その季節・時間に出てよいレア。桜は春、雪は冬、流れ星は夜だけ、虹は夜以外、文化祭は秋 */
export function rareCandidates(season: Season, time: BackdropTime): BackdropRare[] {
  const list: BackdropRare[] = [];
  if (season === "haru") list.push("sakura");
  if (season === "fuyu") list.push("snow");
  if (season === "aki") list.push("festival");
  if (time === "night") list.push("shooting-star");
  else list.push("rainbow");
  return list;
}

/** その日にレアが出るか。出るなら何か。まれ（およそ12日に1日） */
export function backdropRare(dateKey: string, season: Season, time: BackdropTime): BackdropRare | null {
  if (hash(`rare-${dateKey}`) % 100 >= RARE_PER_100) return null;
  const candidates = rareCandidates(season, time);
  return candidates[hash(`which-${dateKey}`) % candidates.length];
}

/**
 * `?bg=` の読み方（撮影と画面テスト用）。`-` か `,` で区切った言葉を順に見る。
 * 時間（morning / noon / evening / night）、場所（classroom / schoolyard / hallway / library）、
 * `rare-<名前>`（rare-snow など）、`plain`（レアを出さない）。知らない言葉は無視する。
 */
export function parseBackdropParam(value: string | null | undefined): BackdropOverride {
  const result: BackdropOverride = {};
  if (!value) return result;
  const words = value.trim().toLowerCase().split(/[,\s]+/).filter(Boolean);
  for (const word of words) {
    if (word.startsWith("rare-")) {
      const name = word.slice("rare-".length);
      if ((BACKDROP_RARES as readonly string[]).includes(name)) result.rare = name as BackdropRare;
      continue;
    }
    if (word === "plain") {
      result.rare = null;
      continue;
    }
    for (const part of word.split("-")) {
      if ((BACKDROP_TIMES as readonly string[]).includes(part)) result.time = part as BackdropTime;
      else if ((BACKDROP_PLACES as readonly string[]).includes(part)) result.place = part as BackdropPlace;
    }
  }
  return result;
}

/** 今の背景。固定（?bg=）があればそちらを優先する */
export function pickBackdrop(now: Date, override: BackdropOverride = {}): Backdrop {
  const dateKey = backdropDateKey(now);
  const time = override.time ?? backdropTime(partnerHour(now));
  const place = override.place ?? backdropPlace(dateKey);
  const rare = override.rare !== undefined ? override.rare : backdropRare(dateKey, seasonOf(now), time);
  return { time, place, rare };
}

/** レアが出たときの、パートナーの一言 */
export function rareLine(rare: BackdropRare, role: string | undefined): string {
  return RARE_LINES[rare][role === "student" ? "student" : "teacher"];
}

/** 今の一言の前に添える形（句点で区切る）。「今日は虹が出てるよ。」＋今の問いかけ */
export function rarePrefix(rare: BackdropRare, role: string | undefined): string {
  const line = rareLine(rare, role);
  return /[。！？!?]$/.test(line) ? line : `${line}。`;
}

/** 見たレア背景の記録（コレクション）。名前と、初めて見た日 */
export type SeenRare = { rare: BackdropRare; firstSeen: string };

/** 記録に足す。同じものは初めての日のまま。並びはレアの一覧の順 */
export function addSeenRare(seen: readonly SeenRare[], rare: BackdropRare, dateKey: string): SeenRare[] {
  if (seen.some((item) => item.rare === rare)) return [...seen];
  const next = [...seen, { rare, firstSeen: dateKey }];
  return next.sort((a, b) => BACKDROP_RARES.indexOf(a.rare) - BACKDROP_RARES.indexOf(b.rare));
}

/** 保存した文字から記録を読む。壊れていれば空 */
export function parseSeenRares(raw: string | null): SeenRare[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is SeenRare =>
        typeof item === "object" &&
        item !== null &&
        (BACKDROP_RARES as readonly string[]).includes((item as SeenRare).rare) &&
        typeof (item as SeenRare).firstSeen === "string",
    );
  } catch {
    return [];
  }
}

/** 端末に残す場所（人ごと） */
export function seenRaresKey(owner: string): string {
  return `koekata:backdrop-rares:${owner}`;
}
