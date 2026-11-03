import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** 順番に適用する変更。公開後は書き換えず、末尾に足す。 */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE app_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
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
  holder.koekataDb ??= openDatabase(process.env.KOEKATA_DB_PATH ?? "data/koekata.db");
  return holder.koekataDb;
}
