import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { roomToken } from "./avatar-art";
import { examPeriods } from "./seed-data";

export const STUDY_MS = 25 * 60 * 1000;
/** 時計のずれを許して、終わりとみなす余裕 */
const COMPLETE_MARGIN_MS = 30 * 1000;
/** これより遅い時間は、続けるよう促さない */
const LATE_HOUR = 22;
const EARLY_HOUR = 5;

/** デモの自習室が空にならないよう一緒にいる、ダミーの人たち */
const DEMO_COMPANIONS = ["aoki", "nakamura"];

/** 残り時間はサーバーの時計で数える。端末の時計がずれていても、すぐ終わったりしない。 */
export type StudySession = { id: string; remainingMs: number };
/** 自習室に見せるもの。人数とパートナーの印だけで、名前は出さない。 */
export type StudyPresence = { count: number; tokens: string[] };

function japanParts(now: Date) {
  const text = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [date, hour] = text.split(" ");
  return { date, hour: Number(hour) };
}

export function isExamPeriod(now: Date): boolean {
  const { date } = japanParts(now);
  return examPeriods.some(({ from, to }) => date >= from && date <= to);
}

export function isLateNight(now: Date): boolean {
  const { hour } = japanParts(now);
  return hour >= LATE_HOUR || hour < EARLY_HOUR;
}

export function studyQuestion(now: Date): string {
  return isExamPeriod(now) ? "テスト勉強、今日はどこまで進みましたか？" : "今日は何をやりましたか？";
}

/** デモ用：誰もいないときだけ、ダミーの人たちが勉強している状態にする。葉には数えない。 */
export function ensureDemoCompanions(db: DatabaseSync, now: Date): void {
  if (getPresence(db, now).count > 0) return;
  const insert = db.prepare(
    "INSERT INTO study_sessions (id, person_id, started_at, ends_at, is_demo) VALUES (?, ?, ?, ?, 1)",
  );
  for (const personId of DEMO_COMPANIONS) {
    if (findActive(db, personId, now)) continue;
    insert.run(randomUUID(), personId, now.toISOString(), new Date(now.getTime() + STUDY_MS).toISOString());
  }
}

function findActive(db: DatabaseSync, personId: string, now: Date): { id: string; endsAt: string; isDemo: boolean } | null {
  const row = db
    .prepare(
      `SELECT id, ends_at, is_demo FROM study_sessions
       WHERE person_id = ? AND finished_at IS NULL AND ends_at > ?
       ORDER BY ends_at DESC LIMIT 1`,
    )
    .get(personId, now.toISOString()) as { id: string; ends_at: string; is_demo: number } | undefined;
  return row ? { id: row.id, endsAt: row.ends_at, isDemo: row.is_demo === 1 } : null;
}

/** 本人の今の勉強。デモのダミーは本人の勉強として扱わない。 */
export function findOwnSession(db: DatabaseSync, personId: string, now: Date): StudySession | null {
  const active = findActive(db, personId, now);
  return active && !active.isDemo ? { id: active.id, remainingMs: Date.parse(active.endsAt) - now.getTime() } : null;
}

export function startStudy(db: DatabaseSync, personId: string, now: Date): StudySession {
  const existing = findOwnSession(db, personId, now);
  if (existing) return existing;

  // デモのダミーとして勉強中の人を操作したときは、本人の勉強に置き換える
  db.prepare("UPDATE study_sessions SET finished_at = ? WHERE person_id = ? AND finished_at IS NULL AND is_demo = 1").run(
    now.toISOString(),
    personId,
  );
  const session = { id: randomUUID(), remainingMs: STUDY_MS };
  db.prepare("INSERT INTO study_sessions (id, person_id, started_at, ends_at) VALUES (?, ?, ?, ?)").run(
    session.id,
    personId,
    now.toISOString(),
    new Date(now.getTime() + STUDY_MS).toISOString(),
  );
  return session;
}

/** 勉強を終える。最後まで続けたときだけ完走として数える（桜の葉になる）。本人のものだけ。 */
export function finishStudy(db: DatabaseSync, personId: string, sessionId: string, now: Date): { completed: boolean } | null {
  const row = db
    .prepare("SELECT ends_at, finished_at FROM study_sessions WHERE id = ? AND person_id = ? AND is_demo = 0")
    .get(sessionId, personId) as { ends_at: string; finished_at: string | null } | undefined;
  if (!row) return null;
  if (row.finished_at) {
    const { completed } = db.prepare("SELECT completed FROM study_sessions WHERE id = ?").get(sessionId) as {
      completed: number;
    };
    return { completed: completed === 1 };
  }
  const completed = now.getTime() >= Date.parse(row.ends_at) - COMPLETE_MARGIN_MS;
  db.prepare("UPDATE study_sessions SET finished_at = ?, completed = ? WHERE id = ?").run(
    now.toISOString(),
    completed ? 1 : 0,
    sessionId,
  );
  return { completed };
}

export function getPresence(db: DatabaseSync, now: Date): StudyPresence {
  const rows = db
    .prepare(
      "SELECT DISTINCT person_id FROM study_sessions WHERE finished_at IS NULL AND ends_at > ? ORDER BY person_id",
    )
    .all(now.toISOString()) as { person_id: string }[];
  return { count: rows.length, tokens: rows.map((row) => roomToken(db, row.person_id, now)) };
}

/**
 * 自習室で押したパートナーの名札（0-3f）。名前と肩書（people の label）と、勉強しはじめてからの分だけ。
 * 職員室のことや投稿は出さない。並びは getPresence の tokens と同じ。
 */
export type StudyMate = { id: string; name: string; label: string; minutes: number };

export function getStudyMates(db: DatabaseSync, now: Date): StudyMate[] {
  const rows = db
    .prepare(
      `SELECT s.person_id AS id, p.name AS name, p.label AS label, MIN(s.started_at) AS started_at
       FROM study_sessions s JOIN people p ON p.id = s.person_id
       WHERE s.finished_at IS NULL AND s.ends_at > ?
       GROUP BY s.person_id ORDER BY s.person_id`,
    )
    .all(now.toISOString()) as { id: string; name: string; label: string; started_at: string }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    label: row.label,
    minutes: Math.max(1, Math.floor((now.getTime() - Date.parse(row.started_at)) / 60_000)),
  }));
}

export function handleStudy(db: DatabaseSync, personId: string, input: unknown, now: Date = new Date()) {
  const { action, sessionId } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (action === "start") {
    return { status: 200, body: { session: startStudy(db, personId, now), presence: getPresence(db, now) } };
  }
  if (action === "finish" && typeof sessionId === "string") {
    const result = finishStudy(db, personId, sessionId, now);
    if (!result) return { status: 404, body: { error: "勉強の記録が見つかりません" } };
    return {
      status: 200,
      body: { ...result, question: studyQuestion(now), lateNight: isLateNight(now), presence: getPresence(db, now) },
    };
  }
  return { status: 400, body: { error: "依頼が正しくありません" } };
}
