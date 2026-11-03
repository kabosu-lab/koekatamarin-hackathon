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
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function getSchemaVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

function migrate(db: DatabaseSync): void {
  const current = getSchemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `データベースの版（${current}）がアプリの版（${SCHEMA_VERSION}）より新しいため開けません`,
    );
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[version]);
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
  }
  return holder.koekataDb;
}
