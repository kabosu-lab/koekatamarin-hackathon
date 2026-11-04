import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, readSchemaVersion, SCHEMA_VERSION } from "./db";
import { seedDatabase } from "./seed";

/** 反応の移行より前の版。反応の移行はいちばん最後ではなくなっても、この数は変えない */
const SCHEMA_VERSION_BEFORE_REACTIONS = SCHEMA_VERSION - 1;

const dirs: string[] = [];

function tempPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "koekata-db-"));
  dirs.push(dir);
  return join(dir, "nested", "test.db");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("新しいデータベースを最新の版にする", () => {
    const db = openDatabase(":memory:");
    expect(readSchemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("外部キーの制約を有効にする", () => {
    const db = openDatabase(":memory:");
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it("開き直してもデータが残り、変更を二重に適用しない", () => {
    const path = tempPath();
    const first = openDatabase(path);
    first.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("school", "ダミー");
    first.close();

    const second = openDatabase(path);
    expect(readSchemaVersion(second)).toBe(SCHEMA_VERSION);
    expect(second.prepare("SELECT value FROM app_meta WHERE key = ?").get("school")).toEqual({
      value: "ダミー",
    });
    second.close();
  });

  it("アプリより新しい版のデータベースは開かない", () => {
    const path = tempPath();
    openDatabase(path).close();
    const raw = new DatabaseSync(path);
    raw.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    raw.close();

    expect(() => openDatabase(path)).toThrow("開けません");
  });
});

describe("知恵の反応の移行", () => {
  it("いいねと「うまくいかなかった」へ、前の行を失わずに移す", () => {
    const path = tempPath();
    const seeded = openDatabase(path);
    seedDatabase(seeded);
    seeded.close();
    const raw = new DatabaseSync(path);
    raw.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE knowledge_note_votes;
      DROP TABLE knowledge_notes;
      DROP TABLE knowledge_reviews;
      CREATE TABLE knowledge_reviews (
        id TEXT PRIMARY KEY, item_id TEXT NOT NULL, reviewer_id TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK (verdict IN ('helped', 'fix')),
        comment TEXT NOT NULL, resolved_at TEXT, created_at TEXT NOT NULL,
        UNIQUE (item_id, reviewer_id)
      ) STRICT;
      INSERT INTO knowledge_reviews VALUES ('a', 'knowledge-quick-quiz', 'saeki', 'helped', '', NULL, 't');
      INSERT INTO knowledge_reviews VALUES ('b', 'knowledge-quick-quiz', 'aoki', 'fix', '理由', 'r', 't');
      PRAGMA user_version = ${SCHEMA_VERSION_BEFORE_REACTIONS};
    `);
    raw.close();
    const db = openDatabase(path);
    expect(db.prepare("SELECT id, verdict, comment, resolved_at FROM knowledge_reviews ORDER BY id").all()).toEqual([
      { id: "a", verdict: "like", comment: "", resolved_at: null },
      { id: "b", verdict: "not_working", comment: "理由", resolved_at: "r" },
    ]);
    db.close();
  });
});
