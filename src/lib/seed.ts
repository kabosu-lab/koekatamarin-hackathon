import type { DatabaseSync } from "node:sqlite";
import { channels, homeroomTeachers, people, posts, seedAvatars } from "./seed-data";

/** 文字列のまま時刻順に並ぶよう、すべて UTC の形で保存する。 */
function toStored(time: string): string {
  return new Date(time).toISOString();
}

/** あとから足した人物の情報を、前からある DB にも入れる。何度動かしても同じで、本人が決めたものは変えない。 */
function syncPeople(db: DatabaseSync): void {
  const setHomeroom = db.prepare(
    "UPDATE people SET homeroom_teacher_id = ? WHERE id = ? AND homeroom_teacher_id IS NULL",
  );
  for (const [studentId, teacherId] of Object.entries(homeroomTeachers)) {
    setHomeroom.run(teacherId, studentId);
  }
  const insertAvatar = db.prepare(
    "INSERT OR IGNORE INTO avatars (person_id, family) SELECT id, ? FROM people WHERE id = ?",
  );
  for (const [personId, family] of Object.entries(seedAvatars)) {
    insertAvatar.run(family, personId);
  }
}

/** ダミーのデータを入れる。すでに人物がいるときは入れ直さない（デモの続きを消さない）。 */
export function seedDatabase(db: DatabaseSync): void {
  const { count } = db.prepare("SELECT count(*) AS count FROM people").get() as { count: number };
  if (count > 0) {
    syncPeople(db);
    return;
  }

  const insertPerson = db.prepare(
    "INSERT INTO people (id, name, role, label, public_profile) VALUES (?, ?, ?, ?, ?)",
  );
  const insertChannel = db.prepare(
    "INSERT INTO channels (id, name, description, audience) VALUES (?, ?, ?, ?)",
  );
  const insertPost = db.prepare(
    "INSERT INTO posts (id, channel_id, author_id, kind, body, created_at, asked_person_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertReply = db.prepare(
    "INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertLike = db.prepare("INSERT INTO post_likes (post_id, person_id) VALUES (?, ?)");

  db.exec("BEGIN");
  try {
    for (const p of people) {
      insertPerson.run(p.id, p.name, p.role, p.label, p.publicProfile);
    }
    syncPeople(db);
    for (const c of channels) {
      insertChannel.run(c.id, c.name, c.description, c.audience);
    }
    for (const post of posts) {
      insertPost.run(post.id, post.channelId, post.authorId, post.kind, post.body, toStored(post.createdAt), post.askedPersonId ?? null);
      for (const r of post.replies) {
        insertReply.run(r.id, post.id, r.authorId, r.body, toStored(r.createdAt));
      }
      for (const personId of post.likedBy) {
        insertLike.run(post.id, personId);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
