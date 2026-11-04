import type { DatabaseSync } from "node:sqlite";
import { channels, homeroomTeachers, pastReports, people, posts, seedAvatars, seedKnowledge, seedKnowledgeNotes } from "./seed-data";

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

const KNOWLEDGE_SEEDED = "seed_knowledge";

/** 最初の知恵を、前からある DB にも1度だけ入れる。本人が取り下げたものを戻さない。 */
function syncKnowledge(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(KNOWLEDGE_SEEDED)) return;
  const insertPost = db.prepare(
    "INSERT OR IGNORE INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insertReply = db.prepare(
    "INSERT OR IGNORE INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertLike = db.prepare("INSERT OR IGNORE INTO post_likes (post_id, person_id) VALUES (?, ?)");
  const insertItem = db.prepare(
    `INSERT INTO knowledge_items (id, source_post_id, title, body, status, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'shared', ?, ?, ?)`,
  );
  const insertContributor = db.prepare("INSERT OR IGNORE INTO knowledge_contributors (item_id, person_id, state) VALUES (?, ?, 'ok')");
  const insertReview = db.prepare(
    "INSERT INTO knowledge_reviews (id, item_id, reviewer_id, verdict, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const seed of seedKnowledge) {
    const post = posts.find((p) => p.id === seed.postId);
    if (!post) continue;
    const stamp = toStored(post.replies.at(-1)?.createdAt ?? post.createdAt);
    insertPost.run(post.id, post.channelId, post.authorId, post.kind, post.body, toStored(post.createdAt));
    for (const r of post.replies) insertReply.run(r.id, post.id, r.authorId, r.body, toStored(r.createdAt));
    for (const personId of post.likedBy) insertLike.run(post.id, personId);
    insertItem.run(seed.id, post.id, seed.title, seed.body, seed.authorId, stamp, stamp);
    for (const personId of [post.authorId, ...post.replies.map((r) => r.authorId)]) insertContributor.run(seed.id, personId);
    seed.reviews.forEach((review, index) => {
      insertReview.run(`${seed.id}-review-${index}`, seed.id, review.reviewerId, review.verdict, review.comment, stamp);
    });
  }
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, '1')").run(KNOWLEDGE_SEEDED);
}

const TITLES_SEEDED = "seed_titles";

/** 最初の肩書きを、前からある DB にも1度だけ入れる。名前の横の例と、受け取りを待つ例。 */
function syncTitles(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(TITLES_SEEDED)) return;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO person_titles (id, person_id, from_person_id, title, state, worn, created_at, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const stamp = "2026-10-31T08:00:00.000Z";
  insert.run("title-noda", "noda", "saeki", "3D プリンターの相談役", "accepted", 1, stamp, stamp);
  insert.run("title-saeki", "saeki", "kawamura", "作文の一言名人", "offered", 0, stamp, null);
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, '1')").run(TITLES_SEEDED);
}

/** ダミーのデータを入れる。すでに人物がいるときは入れ直さない（デモの続きを消さない）。 */
const NOTES_SEEDED = "seed_knowledge_notes";

/** 最初の注釈を、前からある DB にも1度だけ入れる。 */
function syncKnowledgeNotes(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get(NOTES_SEEDED)) return;
  const insertNote = db.prepare("INSERT OR IGNORE INTO knowledge_notes (id, item_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)");
  const insertVote = db.prepare("INSERT OR IGNORE INTO knowledge_note_votes (note_id, person_id) VALUES (?, ?)");
  for (const note of seedKnowledgeNotes) {
    if (!db.prepare("SELECT 1 FROM knowledge_items WHERE id = ?").get(note.itemId)) continue;
    insertNote.run(note.id, note.itemId, note.authorId, note.body, "2026-10-25T00:00:00.000Z");
    for (const voterId of note.voterIds) insertVote.run(note.id, voterId);
  }
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, '1')").run(NOTES_SEEDED);
}

export function seedDatabase(db: DatabaseSync): void {
  const { count } = db.prepare("SELECT count(*) AS count FROM people").get() as { count: number };
  if (count > 0) {
    syncPeople(db);
    syncKnowledge(db);
    syncKnowledgeNotes(db);
    syncTitles(db);
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
    const insertReport = db.prepare("INSERT INTO daily_reports (id, person_id, date, created_at) VALUES (?, ?, ?, ?)");
    const insertItem = db.prepare("INSERT INTO report_items (id, report_id, position, text) VALUES (?, ?, ?, ?)");
    pastReports.forEach((report, reportIndex) => {
      const id = `past-${reportIndex}`;
      insertReport.run(id, report.personId, report.date, toStored(`${report.date}T18:00:00+09:00`));
      report.items.forEach((text, position) => insertItem.run(`${id}-${position}`, id, position, text));
    });
    syncKnowledge(db);
    syncKnowledgeNotes(db);
    syncTitles(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
