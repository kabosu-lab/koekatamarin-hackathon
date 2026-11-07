import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedDatabase } from "./seed";

/** 順番に適用する変更。公開後は書き換えず、末尾に足す。 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE app_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   ) STRICT;`,
  `CREATE TABLE people (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('teacher', 'admin', 'student')),
     label TEXT NOT NULL,
     public_profile TEXT NOT NULL
   ) STRICT;
   CREATE TABLE channels (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT NOT NULL,
     audience TEXT NOT NULL CHECK (audience IN ('everyone', 'staff'))
   ) STRICT;
   CREATE TABLE posts (
     id TEXT PRIMARY KEY,
     channel_id TEXT NOT NULL REFERENCES channels (id),
     author_id TEXT NOT NULL REFERENCES people (id),
     kind TEXT NOT NULL CHECK (kind IN ('notice', 'trouble', 'worry', 'effort', 'report')),
     body TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX posts_by_channel ON posts (channel_id, created_at);
   CREATE TABLE replies (
     id TEXT PRIMARY KEY,
     post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES people (id),
     body TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX replies_by_post ON replies (post_id, created_at);
   CREATE TABLE post_likes (
     post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     PRIMARY KEY (post_id, person_id)
   ) STRICT;`,
  `ALTER TABLE posts ADD COLUMN researched_with_ai INTEGER NOT NULL DEFAULT 0
     CHECK (researched_with_ai IN (0, 1));`,
  `CREATE TABLE safety_alerts (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     summary TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX safety_alerts_by_person ON safety_alerts (person_id, updated_at);
   CREATE TABLE safety_alert_recipients (
     alert_id TEXT NOT NULL REFERENCES safety_alerts (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     PRIMARY KEY (alert_id, person_id)
   ) STRICT;`,
  `ALTER TABLE posts ADD COLUMN asked_person_id TEXT REFERENCES people (id);`,
  `CREATE TABLE post_passes (
     id TEXT PRIMARY KEY,
     post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
     from_person_id TEXT NOT NULL REFERENCES people (id),
     to_person_id TEXT NOT NULL REFERENCES people (id),
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX post_passes_by_post ON post_passes (post_id, created_at);`,
  `CREATE TABLE post_views (
     post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     seen_at TEXT NOT NULL,
     PRIMARY KEY (post_id, person_id)
   ) STRICT;`,
  `CREATE TABLE avatars (
     person_id TEXT PRIMARY KEY REFERENCES people (id),
     family TEXT NOT NULL
   ) STRICT;
   CREATE TABLE thanks (
     id TEXT PRIMARY KEY,
     from_person_id TEXT NOT NULL REFERENCES people (id),
     to_person_id TEXT NOT NULL REFERENCES people (id),
     message TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX thanks_by_receiver ON thanks (to_person_id, created_at);
   CREATE TABLE profile_drafts (
     person_id TEXT PRIMARY KEY REFERENCES people (id),
     text TEXT NOT NULL,
     revised INTEGER NOT NULL DEFAULT 0 CHECK (revised IN (0, 1))
   ) STRICT;`,
  `CREATE TABLE study_sessions (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     started_at TEXT NOT NULL,
     ends_at TEXT NOT NULL,
     finished_at TEXT,
     completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
     is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))
   ) STRICT;
   CREATE INDEX study_sessions_active ON study_sessions (finished_at, ends_at);`,
  `ALTER TABLE people ADD COLUMN homeroom_teacher_id TEXT REFERENCES people (id);
   CREATE TABLE daily_reports (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     date TEXT NOT NULL,
     created_at TEXT NOT NULL,
     UNIQUE (person_id, date)
   ) STRICT;
   CREATE TABLE report_items (
     id TEXT PRIMARY KEY,
     report_id TEXT NOT NULL REFERENCES daily_reports (id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     text TEXT NOT NULL,
     checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1))
   ) STRICT;
   CREATE TABLE report_responses (
     id TEXT PRIMARY KEY,
     report_id TEXT NOT NULL REFERENCES daily_reports (id) ON DELETE CASCADE,
     from_person_id TEXT NOT NULL REFERENCES people (id),
     text TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;`,
  `ALTER TABLE posts ADD COLUMN scope TEXT NOT NULL DEFAULT 'everyone'
     CHECK (scope IN ('everyone', 'person', 'managers', 'self'));
   ALTER TABLE posts ADD COLUMN scope_person_id TEXT REFERENCES people (id);`,
  `CREATE TABLE companion_memories (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     text TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX companion_memories_by_person ON companion_memories (person_id, created_at);
   CREATE TABLE forgotten_words (
     person_id TEXT NOT NULL REFERENCES people (id),
     source_id TEXT NOT NULL,
     PRIMARY KEY (person_id, source_id)
   ) STRICT;`,
  `ALTER TABLE posts ADD COLUMN needs_look INTEGER NOT NULL DEFAULT 0 CHECK (needs_look IN (0, 1));
   ALTER TABLE posts ADD COLUMN shared_to_staff INTEGER NOT NULL DEFAULT 0 CHECK (shared_to_staff IN (0, 1));`,
  `ALTER TABLE safety_alerts ADD COLUMN disputed_at TEXT;`,
  `CREATE TABLE hidden_people (
     person_id TEXT NOT NULL REFERENCES people (id),
     hidden_person_id TEXT NOT NULL REFERENCES people (id),
     created_at TEXT NOT NULL,
     PRIMARY KEY (person_id, hidden_person_id)
   ) STRICT;`,
  `CREATE TABLE knowledge_items (
     id TEXT PRIMARY KEY,
     source_post_id TEXT NOT NULL REFERENCES posts (id),
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('confirming', 'shared', 'withdrawn')),
     fix_requested INTEGER NOT NULL DEFAULT 0 CHECK (fix_requested IN (0, 1)),
     author_id TEXT NOT NULL REFERENCES people (id),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX knowledge_items_by_status ON knowledge_items (status, updated_at);
   CREATE TABLE knowledge_contributors (
     item_id TEXT NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     state TEXT NOT NULL CHECK (state IN ('waiting', 'ok', 'removed')),
     PRIMARY KEY (item_id, person_id)
   ) STRICT;
   CREATE TABLE knowledge_reviews (
     id TEXT PRIMARY KEY,
     item_id TEXT NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
     reviewer_id TEXT NOT NULL REFERENCES people (id),
     verdict TEXT NOT NULL CHECK (verdict IN ('helped', 'fix')),
     comment TEXT NOT NULL,
     resolved_at TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (item_id, reviewer_id)
   ) STRICT;`,
  `CREATE TABLE attachments (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES people (id),
     post_id TEXT UNIQUE REFERENCES posts (id) ON DELETE CASCADE,
     media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
     file_name TEXT NOT NULL,
     data BLOB NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX attachments_pending ON attachments (owner_id, post_id);
   ALTER TABLE knowledge_items ADD COLUMN show_attachment INTEGER NOT NULL DEFAULT 0 CHECK (show_attachment IN (0, 1));`,
  `ALTER TABLE daily_reports ADD COLUMN made_by TEXT NOT NULL DEFAULT 'manual' CHECK (made_by IN ('manual', 'agent'));`,
  `CREATE TABLE avatar_art (
     person_id TEXT PRIMARY KEY REFERENCES people (id),
     token TEXT NOT NULL UNIQUE,
     room_token TEXT NOT NULL UNIQUE,
     status TEXT NOT NULL CHECK (status IN ('none', 'pending', 'ready', 'failed')),
     source TEXT CHECK (source IN ('claude', 'code')),
     stage INTEGER NOT NULL,
     traits TEXT,
     body TEXT,
     poses TEXT,
     updated_at TEXT NOT NULL
   ) STRICT;`,
  `CREATE TABLE knowledge_reviews_new (
     id TEXT PRIMARY KEY,
     item_id TEXT NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
     reviewer_id TEXT NOT NULL REFERENCES people (id),
     verdict TEXT NOT NULL CHECK (verdict IN ('like', 'not_working')),
     comment TEXT NOT NULL,
     resolved_at TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (item_id, reviewer_id)
   ) STRICT;
   INSERT INTO knowledge_reviews_new (id, item_id, reviewer_id, verdict, comment, resolved_at, created_at)
     SELECT id, item_id, reviewer_id, CASE verdict WHEN 'helped' THEN 'like' ELSE 'not_working' END, comment, resolved_at, created_at
     FROM knowledge_reviews;
   DROP TABLE knowledge_reviews;
   ALTER TABLE knowledge_reviews_new RENAME TO knowledge_reviews;
   CREATE TABLE knowledge_notes (
     id TEXT PRIMARY KEY,
     item_id TEXT NOT NULL REFERENCES knowledge_items (id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES people (id),
     body TEXT NOT NULL,
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX knowledge_notes_by_item ON knowledge_notes (item_id, created_at);
   CREATE TABLE knowledge_note_votes (
     note_id TEXT NOT NULL REFERENCES knowledge_notes (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     PRIMARY KEY (note_id, person_id)
   ) STRICT;`,
  `ALTER TABLE avatars ADD COLUMN shown_stage INTEGER;
   ALTER TABLE avatar_art ADD COLUMN talent TEXT;
   ALTER TABLE avatar_art ADD COLUMN reason TEXT;`,
  `CREATE TABLE avatar_evolutions (
     person_id TEXT NOT NULL REFERENCES people (id),
     target_stage INTEGER NOT NULL,
     candidates TEXT NOT NULL,
     created_at TEXT NOT NULL,
     PRIMARY KEY (person_id, target_stage)
   ) STRICT;`,
  `CREATE TABLE person_ribbons (
     person_id TEXT NOT NULL REFERENCES people (id),
     ribbon_id TEXT NOT NULL,
     earned_at TEXT NOT NULL,
     is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
     seen_at TEXT,
     PRIMARY KEY (person_id, ribbon_id)
   ) STRICT;`,
  `CREATE TABLE gift_eggs (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     earned_at TEXT NOT NULL,
     opened_at TEXT,
     family TEXT,
     reason TEXT
   ) STRICT;
   CREATE INDEX gift_eggs_by_person ON gift_eggs (person_id, earned_at);
   CREATE TABLE gift_egg_credits (
     person_id TEXT NOT NULL REFERENCES people (id),
     source_id TEXT NOT NULL,
     partner_id TEXT NOT NULL REFERENCES people (id),
     day TEXT NOT NULL,
     created_at TEXT NOT NULL,
     egg_id TEXT REFERENCES gift_eggs (id),
     PRIMARY KEY (person_id, source_id),
     UNIQUE (person_id, partner_id, day)
   ) STRICT;
   CREATE TABLE avatar_companions (
     person_id TEXT NOT NULL REFERENCES people (id),
     family TEXT NOT NULL,
     shown_stage INTEGER NOT NULL,
     obtained_at TEXT NOT NULL,
     PRIMARY KEY (person_id, family)
   ) STRICT;`,
  `CREATE TABLE person_titles (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     from_person_id TEXT NOT NULL REFERENCES people (id),
     title TEXT NOT NULL,
     state TEXT NOT NULL CHECK (state IN ('offered', 'accepted', 'declined')),
     worn INTEGER NOT NULL DEFAULT 0 CHECK (worn IN (0, 1)),
     created_at TEXT NOT NULL,
     decided_at TEXT,
     UNIQUE (person_id, from_person_id, title)
   ) STRICT;
   CREATE UNIQUE INDEX person_titles_one_worn ON person_titles (person_id) WHERE worn = 1;`,
  // リボンをもらった物語。誰の役に立ったかの一言と、その日
  `ALTER TABLE person_ribbons ADD COLUMN story TEXT;
   ALTER TABLE person_ribbons ADD COLUMN story_at TEXT;`,
  // 頑張りたいこと。本人だけのもの。乗り越えた投稿の印は、投稿が消えると消える
  `CREATE TABLE goals (
     id TEXT PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     text TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('active', 'done')),
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX goals_by_person ON goals (person_id, status);
   CREATE TABLE goal_settings (
     person_id TEXT PRIMARY KEY REFERENCES people (id),
     nudge TEXT NOT NULL CHECK (nudge IN ('gentle', 'blunt'))
   ) STRICT;
   CREATE TABLE goal_posts (
     post_id TEXT PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
     created_at TEXT NOT NULL
   ) STRICT;`,
  // 試用中の生徒からの改善点。誰が送ったかは残さない（人物、cookie、IP の列を作らない）
  `CREATE TABLE trial_feedback (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     body TEXT NOT NULL,
     path TEXT NOT NULL,
     screen_width INTEGER,
     created_at TEXT NOT NULL
   ) STRICT;`,
  // トロフィーの判定に使う操作の記録。話の中身も投稿の本文も残さない。知恵の種類は本人が選ぶ（本文を読んで判定しないため）
  `CREATE TABLE trophy_log (
     id INTEGER PRIMARY KEY,
     person_id TEXT NOT NULL REFERENCES people (id),
     kind TEXT NOT NULL,
     ref TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL
   ) STRICT;
   CREATE INDEX trophy_log_by_person ON trophy_log (person_id, kind, created_at);
   ALTER TABLE knowledge_items ADD COLUMN topic TEXT NOT NULL DEFAULT 'general'
     CHECK (topic IN ('general', 'procedure', 'failure', 'tidy'));`,
  // 届いた返事の知らせを閉じた印。知らせるのは投稿した本人だけなので、返事ごとに1つでよい。今ある返事は知らせない
  `CREATE TABLE seen_replies (
     reply_id TEXT PRIMARY KEY REFERENCES replies (id) ON DELETE CASCADE
   ) STRICT;
   INSERT INTO seen_replies (reply_id) SELECT id FROM replies;`,
  // ポートフォリオ。本人が選んだ印と、本人が残したふりかえりだけを持つ。本文を写さないので、元の投稿を取り消せば一緒に消える
  `CREATE TABLE portfolio_items (
     person_id TEXT NOT NULL REFERENCES people (id),
     term TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('post', 'thanks', 'knowledge', 'trophy')),
     ref TEXT NOT NULL,
     added_at TEXT NOT NULL,
     PRIMARY KEY (person_id, term, kind, ref)
   ) STRICT;
   CREATE TABLE portfolio_reflections (
     person_id TEXT NOT NULL REFERENCES people (id),
     term TEXT NOT NULL,
     text TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (person_id, term)
   ) STRICT;`,
  // こえかたの投稿と返信が、本物の Teams のどれにあたるか。取り消しても残し、読み込み直さない
  `CREATE TABLE teams_links (
     local_id TEXT PRIMARY KEY,
     kind TEXT NOT NULL CHECK (kind IN ('post', 'reply')),
     teams_id TEXT NOT NULL UNIQUE
   ) STRICT;`,
  // 告知の投稿と、「行きます」の反応
  `ALTER TABLE posts ADD COLUMN is_announcement INTEGER NOT NULL DEFAULT 0 CHECK (is_announcement IN (0, 1));
   CREATE TABLE post_rsvps (
     post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
     person_id TEXT NOT NULL REFERENCES people (id),
     PRIMARY KEY (post_id, person_id)
   ) STRICT;`,
  // 広報の候補を本人に確認した記録。断ったことは担当に見せない
  `CREATE TABLE koho_requests (
     post_id TEXT PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
     status TEXT NOT NULL CHECK (status IN ('waiting', 'agreed', 'declined')),
     requested_at TEXT NOT NULL
   ) STRICT;`,
  // 自習室に流れる曲。部屋に1つで、誰が切り替えたかは残さない
  `CREATE TABLE room_music (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     track TEXT NOT NULL,
     changed_at INTEGER NOT NULL
   ) STRICT;`,
  // 日報の足し算（0-1z）。どこまで含めたか（やり取りの時刻と、話の指紋）、夕方の係が走ったか、本人が直した項目
  `ALTER TABLE daily_reports ADD COLUMN included_until TEXT;
   ALTER TABLE daily_reports ADD COLUMN talk_seen TEXT NOT NULL DEFAULT '[]';
   ALTER TABLE daily_reports ADD COLUMN evening_at TEXT;
   ALTER TABLE report_items ADD COLUMN edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1));`,
  // 0-3b：投稿の件名（頭に種類の札）。Teams の件名と同じ。古い投稿にはない
  `ALTER TABLE posts ADD COLUMN subject TEXT;`,
];

export const SCHEMA_VERSION
 = MIGRATIONS.length;

function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function migrate(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): void {
  const current = getSchemaVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `データベースの版（${current}）がアプリの版（${migrations.length}）より新しいため開けません`,
    );
  }
  for (let version = current; version < migrations.length; version += 1) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  migrate(db);
  return db;
}

/** 開いたままの接続の版が古ければ、当て直す。当てたときは true。 */
export function ensureMigrated(db: DatabaseSync, migrations: readonly string[] = MIGRATIONS): boolean {
  if (getSchemaVersion(db) >= migrations.length) return false;
  migrate(db, migrations);
  return true;
}

export function readSchemaVersion(db: DatabaseSync): number {
  return getSchemaVersion(db);
}

// next dev の再読み込みで接続が増えないよう、globalThis に1つだけ持つ
const holder = globalThis as typeof globalThis & { koekataDb?: DatabaseSync };

export function getDatabase(): DatabaseSync {
  if (!holder.koekataDb) {
    const db = openDatabase(process.env.KOEKATA_DB_PATH ?? "data/koekata.db");
    seedDatabase(db);
    holder.koekataDb = db;
  } else if (ensureMigrated(holder.koekataDb)) {
    // 開発サーバーが動いたまま、新しい変更が足されたとき。再起動しなくても直る
    seedDatabase(holder.koekataDb);
  }
  return holder.koekataDb;
}
