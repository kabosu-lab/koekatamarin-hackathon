import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { japanDate } from "./daily";
import { listHiddenIds } from "./hidden-people";
import { thanksSeenSince } from "./new-counts";
import { readThanksKind, type ThanksKind } from "./thanks-kind";

/**
 * 0-3a：サンクスカードを受け取ったときの演出。まだ開いていないカード（「ありがとう」のタイルを最後に開いたあとに届いたもの）を、
 * 話す画面で封筒から開けて見せる。
 */
export type UnopenedThanks = {
  id: string;
  fromId: string;
  fromName: string;
  fromLabel: string;
  message: string;
  kind: ThanksKind;
  createdAt: string;
};

/** まだ開いていないカード。古い順（届いた順に開ける）。しばらく出さない人からのものは出さない */
export function listUnopenedThanks(db: DatabaseSync, viewerId: string): UnopenedThanks[] {
  return listThanksSince(db, viewerId, thanksSeenSince(db, viewerId) ?? "");
}

/** 日本時間のその日の0時（ISO） */
function japanDayStart(now: Date): string {
  return new Date(`${japanDate(now)}T00:00:00+09:00`).toISOString();
}

/**
 * この端末で、まだ封筒から開けていないカード（司令塔の決定：開けたかは端末ごと。数とトロフィーは人物ごとのまま）。
 * - この端末で開けたことがあれば、そのあとに届いたもの
 * - 初めての端末なら、今日届いたものと、どこでもまだ開かれていないもの（試用の人どうしで同じ人物を使っても、どの端末でも最初の1回は見られる）
 */
export function listRevealThanks(db: DatabaseSync, viewerId: string, deviceSeen: string | null, now: Date): UnopenedThanks[] {
  if (deviceSeen && !Number.isNaN(new Date(deviceSeen).getTime())) return listThanksSince(db, viewerId, deviceSeen);
  const today = japanDayStart(now);
  const seen = thanksSeenSince(db, viewerId);
  return listThanksSince(db, viewerId, seen && seen < today ? seen : today);
}

function listThanksSince(db: DatabaseSync, viewerId: string, since: string): UnopenedThanks[] {
  const hidden = listHiddenIds(db, viewerId);
  const rows = db
    .prepare(
      `SELECT t.id, t.from_person_id, p.name, p.label, t.message, t.created_at FROM thanks t
       JOIN people p ON p.id = t.from_person_id
       WHERE t.to_person_id = ? AND t.created_at > ? ORDER BY t.created_at, t.rowid`,
    )
    .all(viewerId, since) as { id: string; from_person_id: string; name: string; label: string; message: string; created_at: string }[];
  return rows
    .filter((row) => !hidden.has(row.from_person_id))
    .map((row) => ({
      id: row.id,
      fromId: row.from_person_id,
      fromName: row.name,
      fromLabel: row.label,
      message: row.message,
      kind: readThanksKind(row.message),
      createdAt: row.created_at,
    }));
}

/** ダミーの同僚からの、その日の1枚。立場で言葉を分ける（先生にはです・ます） */
const WELCOME_WORDS: Record<"student" | "staff", readonly string[]> = {
  student: [
    "朝のあいさつ、いつも気持ちいいよ。ありがとう！",
    "この前の係の仕事、最後まで頑張ってたね。",
    "クラスのみんなに声をかけてくれて、ありがとう。助かったよ。",
  ],
  staff: [
    "いつも職員室を明るくしてくださって、ありがとうございます。",
    "先日の資料、とても助かりました。ありがとうございます。",
    "遅くまで準備、お疲れさまでした。頑張っていらっしゃいましたね。",
  ],
};

function welcomeSender(db: DatabaseSync, viewerId: string): string | null {
  const viewer = db.prepare("SELECT role, homeroom_teacher_id FROM people WHERE id = ?").get(viewerId) as
    | { role: string; homeroom_teacher_id: string | null }
    | undefined;
  if (!viewer) return null;
  // 生徒には担任から。先生には学年主任から（学年主任には国語の先生から）
  const wanted = viewer.role === "student" ? (viewer.homeroom_teacher_id ?? "saeki") : viewerId === "ogawara" ? "saeki" : "ogawara";
  const found = db.prepare("SELECT id FROM people WHERE id = ? AND id <> ?").get(wanted, viewerId) as { id: string } | undefined;
  if (found) return found.id;
  const other = db.prepare("SELECT id FROM people WHERE id <> ? AND role <> 'student' ORDER BY rowid LIMIT 1").get(viewerId) as
    | { id: string }
    | undefined;
  return other?.id ?? null;
}

/**
 * 試用版・審査員用・台本モードでも、届く演出を必ず体験できるように、ダミーの同僚から今日の日付で1枚入れておく（1人に1日1枚）。
 * 話す画面を開いたときに、今日の分がまだなければ足す。言葉は手元の一覧から（Claude は呼ばない）。
 */
export function ensureWelcomeThanks(db: DatabaseSync, viewerId: string, now: Date): boolean {
  const day = japanDate(now);
  const key = `welcome-thanks|${viewerId}|${day}`;
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(key)) return false;
  const from = welcomeSender(db, viewerId);
  if (!from) return false;
  const { role } = db.prepare("SELECT role FROM people WHERE id = ?").get(viewerId) as { role: string };
  const words = WELCOME_WORDS[role === "student" ? "student" : "staff"];
  const message = words[Number(day.replaceAll("-", "")) % words.length];
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(key, from);
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    randomUUID(),
    from,
    viewerId,
    message,
    now.toISOString(),
  );
  return true;
}
