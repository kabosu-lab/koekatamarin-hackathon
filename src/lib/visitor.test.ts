import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabase, openDatabase, pruneVisitorFiles, resetVisitorState, visitorDatabase } from "./db";
import {
  decideVisitorCookie,
  isPublicMode,
  isValidVisitorId,
  newVisitorId,
  signVisitorId,
  VISITOR_COOKIE,
  verifyVisitorCookie,
  visitorDbPath,
  visitorsDir,
} from "./visitor";

// Next のサーバーと同じく、要求ごとの記憶（AsyncLocalStorage）を、読み込みより前に置く
vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
});

const SECRET = "test-secret";
const dir = mkdtempSync(join(tmpdir(), "koekata-visitor-"));
let base = "";
let run = 0;

beforeEach(() => {
  vi.stubEnv("KOEKATA_VISITOR_SECRET", SECRET);
  resetVisitorState();
  run += 1;
  base = join(dir, `public-${run}.db`);
});
afterEach(() => {
  resetVisitorState();
  vi.unstubAllEnvs();
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows では開いたままの接続があると消せない。OS の一時フォルダなので残してよい
  }
});

const open = (id: string) => {
  const db = visitorDatabase(id, base);
  if (!db) throw new Error("作れなかった");
  return db;
};
const countPosts = (id: string, body: string) => (open(id).prepare("SELECT count(*) AS n FROM posts WHERE body = ?").get(body) as { n: number }).n;
const writePost = (id: string, body: string) =>
  open(id)
    .prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) SELECT ?, id, 'saeki', 'notice', ?, '2026-11-07T00:00:00.000Z' FROM channels LIMIT 1")
    .run(`p-${id}-${body.length}`, body);
const files = (path: string) => readdirSync(visitorsDir(path)).filter((f) => f.endsWith(".db")).map((f) => f.slice(0, -3));

/** 共有の DB は、書いても何も残らない（画面は落とさない） */
function expectNoWrites(shared: ReturnType<typeof getDatabase>) {
  const count = () => (shared.prepare("SELECT count(*) AS n FROM posts").get() as { n: number }).n;
  const before = count();
  expect(before).toBeGreaterThan(0);
  expect(shared.prepare("DELETE FROM posts").run()).toEqual({ changes: 0, lastInsertRowid: 0 });
  shared.exec("DELETE FROM posts");
  expect(count()).toBe(before);
}

/** Next の要求の中で呼ばれたときと同じ形で、cookie を持たせて動かす */
function inRequest<T>(cookie: string | undefined, fn: () => T): T {
  const store = { type: "request", cookies: { get: (name: string) => (name === VISITOR_COOKIE && cookie ? { name, value: cookie } : undefined) } };
  return workUnitAsyncStorage.run(store as never, fn);
}

describe("訪問者の ID と署名", () => {
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
  });

  it("こちらが署名した ID だけを受け取る。署名なし・偽の署名・別の秘密の署名は通さない", () => {
    const id = newVisitorId();
    const signed = signVisitorId(id);
    expect(verifyVisitorCookie(signed)).toBe(id);
    expect(verifyVisitorCookie(id)).toBeNull();
    expect(verifyVisitorCookie(`${id}.${"0".repeat(32)}`)).toBeNull();
    expect(verifyVisitorCookie(signVisitorId(id, "other-secret"))).toBeNull();
    expect(verifyVisitorCookie(`${newVisitorId()}.${signed.split(".")[1]}`)).toBeNull();
    expect(verifyVisitorCookie(`../x.${signed.split(".")[1]}`)).toBeNull();
  });

  it("cookie を出すのはみんな用だけで、署名の合う ID があれば出し直さない", () => {
    expect(decideVisitorCookie({ publicMode: false, existing: undefined })).toBe("none");
    expect(decideVisitorCookie({ publicMode: true, existing: undefined })).toBe("issue");
    expect(decideVisitorCookie({ publicMode: true, existing: newVisitorId() })).toBe("issue");
    expect(decideVisitorCookie({ publicMode: true, existing: `${newVisitorId()}.${"1".repeat(32)}` })).toBe("issue");
    expect(decideVisitorCookie({ publicMode: true, existing: signVisitorId(newVisitorId()) })).toBe("keep");
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
      expect((open(id).prepare("SELECT count(*) AS n FROM posts").get() as { n: number }).n).toBeGreaterThan(0);
    }
  });

  it("署名つきの cookie で DB を選ぶ。署名なし・偽の cookie では DB を作らず、書き込みを断る共有の DB になる", () => {
    vi.stubEnv("KOEKATA_PUBLIC", "1");
    vi.stubEnv("KOEKATA_DB_PATH", base);
    const a = newVisitorId();
    const b = newVisitorId();
    inRequest(signVisitorId(a), () => getDatabase().prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES ('t1', 'aoki', 'saeki', 'Aのありがとう', '2026-11-07T00:00:00.000Z')").run());
    expect(inRequest(signVisitorId(a), () => getDatabase())).toBe(visitorDatabase(a, base));
    expect(inRequest(signVisitorId(b), () => getDatabase())).toBe(visitorDatabase(b, base));
    expect((open(b).prepare("SELECT count(*) AS n FROM thanks WHERE message = 'Aのありがとう'").get() as { n: number }).n).toBe(0);

    const fake = newVisitorId();
    const before = files(base).length;
    for (const cookie of [undefined, "../x", fake, `${fake}.${"0".repeat(32)}`, signVisitorId(fake, "other-secret")]) {
      const shared = inRequest(cookie, () => getDatabase());
      expect((shared.prepare("SELECT count(*) AS n FROM people").get() as { n: number }).n).toBeGreaterThan(0);
      expectNoWrites(shared);
    }
    expect(getDatabase().prepare("SELECT 1").get()).toBeTruthy(); // 要求の外も同じ共有の DB
    expect(existsSync(visitorDbPath(base, fake))).toBe(false);
    expect(files(base).length).toBe(before);
  });

  it("新しく作るのは1分あたりの上限まで。超えたら作らず、共有の読むだけの DB になる。時間がたてばまた作れる", () => {
    vi.stubEnv("KOEKATA_PUBLIC_NEW_PER_MINUTE", "3");
    vi.stubEnv("KOEKATA_PUBLIC", "1");
    vi.stubEnv("KOEKATA_DB_PATH", base);
    // 要求の中の判定は本当の時刻で数えるので、テストの時刻も本当の時刻にそろえる（壁の時計で結果が変わらないように）
    const now = Date.now();
    const ids = Array.from({ length: 4 }, () => newVisitorId());
    for (const id of ids.slice(0, 3)) expect(visitorDatabase(id, base, now)).not.toBeNull();
    expect(visitorDatabase(ids[3], base, now + 1000)).toBeNull();
    expect(existsSync(visitorDbPath(base, ids[3]))).toBe(false);
    // すでにある訪問者は、上限を超えていても開ける
    expect(visitorDatabase(ids[0], base, now + 1000)).not.toBeNull();
    // 要求の中では、共有の読むだけの DB を渡す
    const shared = inRequest(signVisitorId(newVisitorId()), () => getDatabase());
    expectNoWrites(shared);
    expect(visitorDatabase(ids[3], base, now + 61_000)).not.toBeNull();
  });

  it("ファイルの数の上限を超えても、書いたことのある訪問者のファイルは消さない。空きがなければ作らない", () => {
    vi.stubEnv("KOEKATA_PUBLIC_MAX_VISITORS", "3");
    const real = newVisitorId();
    writePost(real, "本物の訪問者の投稿");
    const idle = newVisitorId();
    open(idle);
    const before = files(base);
    expect(before.sort()).toEqual([real, idle].sort());
    const third = newVisitorId();
    open(third);
    // 3つで満杯。次は、開いている（使っている）ものは消せないので作らない
    expect(visitorDatabase(newVisitorId(), base)).toBeNull();
    expect(files(base).sort()).toEqual([real, idle, third].sort());
  });

  it("空きを作るときは、開いていない・書いたことのない古いファイルだけを消す", () => {
    vi.stubEnv("KOEKATA_PUBLIC_MAX_VISITORS", "3");
    const real = newVisitorId();
    writePost(real, "本物の訪問者の投稿");
    const fakes = Array.from({ length: 3 }, () => newVisitorId());
    for (const id of fakes) openDatabase(visitorDbPath(base, id)).close();
    [real, ...fakes].forEach((id, i) => {
      const t = new Date(Date.UTC(2026, 10, 1, 0, i));
      utimesSync(visitorDbPath(base, id), t, t);
    });
    // 開いておく接続を1つにして、ほかを開くと本物の訪問者の接続は閉じる側に回る（書いたことは覚えている）
    vi.stubEnv("KOEKATA_PUBLIC_OPEN_VISITORS", "1");
    open(fakes[2]);
    expect(pruneVisitorFiles(visitorsDir(base))).toBe(true);
    const left = files(base);
    expect(left).toContain(real);
    expect(left).toContain(fakes[2]); // 開いている
    expect(left).toHaveLength(2); // 書いていない古い fakes[0]・fakes[1] のうち、空きの分だけ消す
  });
});
