import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { getDatabase, openDatabase, pruneVisitorFiles, visitorDatabase } from "./db";
import { decideVisitorCookie, isPublicMode, isValidVisitorId, newVisitorId, VISITOR_COOKIE, visitorDbPath, visitorsDir } from "./visitor";

// Next のサーバーと同じく、要求ごとの記憶（AsyncLocalStorage）を、読み込みより前に置く
vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
});

const dir = mkdtempSync(join(tmpdir(), "koekata-visitor-"));
const base = join(dir, "public.db");

afterEach(() => vi.unstubAllEnvs());
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows では開いたままの接続があると消せない。OS の一時フォルダなので残してよい
  }
});

const countPosts = (id: string, body: string) =>
  (visitorDatabase(id, base).prepare("SELECT count(*) AS n FROM posts WHERE body = ?").get(body) as { n: number }).n;
const writePost = (id: string, body: string) =>
  visitorDatabase(id, base)
    .prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) SELECT ?, id, 'saeki', 'notice', ?, '2026-11-07T00:00:00.000Z' FROM channels LIMIT 1")
    .run(`p-${id}`, body);

/** Next の要求の中で呼ばれたときと同じ形で、cookie を持たせて動かす */
function inRequest<T>(cookie: string | undefined, run: () => T): T {
  const store = { type: "request", cookies: { get: (name: string) => (name === VISITOR_COOKIE && cookie ? { name, value: cookie } : undefined) } };
  return workUnitAsyncStorage.run(store as never, run);
}

describe("訪問者の ID", () => {
  it("推測できない 32 桁の乱数で、毎回ちがう", () => {
    const a = newVisitorId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(isValidVisitorId(a)).toBe(true);
    expect(newVisitorId()).not.toBe(a);
  });

  it("形のちがうものはファイル名に使わない", () => {
    for (const bad of [undefined, "", "../../etc/passwd", "A".repeat(32), `${"a".repeat(31)}/`, "a".repeat(33)]) {
      expect(isValidVisitorId(bad)).toBe(false);
    }
    expect(() => visitorDbPath(base, "../x")).toThrow();
    expect(visitorDbPath(base, "a".repeat(32))).toBe(`${visitorsDir(base)}/${"a".repeat(32)}.db`);
  });

  it("cookie を出すのはみんな用だけで、正しい ID があれば出し直さない", () => {
    expect(decideVisitorCookie({ publicMode: false, existing: undefined })).toBe("none");
    expect(decideVisitorCookie({ publicMode: true, existing: undefined })).toBe("issue");
    expect(decideVisitorCookie({ publicMode: true, existing: "../bad" })).toBe("issue");
    expect(decideVisitorCookie({ publicMode: true, existing: newVisitorId() })).toBe("keep");
  });

  it("みんな用の印は KOEKATA_PUBLIC=1 のときだけ", () => {
    vi.stubEnv("KOEKATA_PUBLIC", "");
    expect(isPublicMode()).toBe(false);
    vi.stubEnv("KOEKATA_PUBLIC", "1");
    expect(isPublicMode()).toBe(true);
  });
});

describe("訪問者ごとの DB", () => {
  it("ほかの訪問者の書き込みは見えず、ダミーの初期データは両方に見える", () => {
    const a = newVisitorId();
    const b = newVisitorId();
    writePost(a, "Aだけの投稿");
    expect(countPosts(a, "Aだけの投稿")).toBe(1);
    expect(countPosts(b, "Aだけの投稿")).toBe(0);
    for (const id of [a, b]) {
      const seeded = visitorDatabase(id, base).prepare("SELECT count(*) AS n FROM posts").get() as { n: number };
      expect(seeded.n).toBeGreaterThan(0);
    }
  });

  it("要求の cookie で DB を選び、訪問者が分からないときは書き込みを断る", () => {
    vi.stubEnv("KOEKATA_PUBLIC", "1");
    vi.stubEnv("KOEKATA_DB_PATH", base);
    const a = newVisitorId();
    const b = newVisitorId();
    inRequest(a, () => writePost(a, "cookieのAの投稿"));
    expect(inRequest(a, () => getDatabase())).toBe(visitorDatabase(a, base));
    expect(inRequest(b, () => getDatabase())).toBe(visitorDatabase(b, base));
    expect(countPosts(b, "cookieのAの投稿")).toBe(0);
    // cookie がない・形がちがう・要求の外は、ダミーの初期データだけを読める DB
    for (const shared of [inRequest(undefined, () => getDatabase()), inRequest("../x", () => getDatabase()), getDatabase()]) {
      expect((shared.prepare("SELECT count(*) AS n FROM people").get() as { n: number }).n).toBeGreaterThan(0);
      expect(() => shared.prepare("DELETE FROM posts").run()).toThrow();
    }
  });

  it("ファイルの数に上限があり、開いていない古いものから消す", () => {
    vi.stubEnv("KOEKATA_PUBLIC_MAX_VISITORS", "3");
    const small = join(dir, "small.db");
    const ids = Array.from({ length: 5 }, () => newVisitorId());
    ids.forEach((id, i) => {
      openDatabase(visitorDbPath(small, id)).close();
      const t = new Date(Date.UTC(2026, 10, 1, 0, i));
      utimesSync(visitorDbPath(small, id), t, t);
    });
    const open = new Map([[ids[0], {} as never]]);
    pruneVisitorFiles(visitorsDir(small), open);
    // 新しい1人の分を空けて2つ残す。開いているもの（いちばん古い）は消さない
    const left = readdirSync(visitorsDir(small)).filter((f) => f.endsWith(".db")).map((f) => f.slice(0, -3)).sort();
    expect(left).toEqual([ids[0], ids[4]].sort());
  });
});
