import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, readSchemaVersion, SCHEMA_VERSION } from "./db";

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
