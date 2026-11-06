import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../db";
import { listReplyNotices } from "../reply-notices";
import { seedDatabase } from "../seed";
import { createDummyTeams } from "./dummy-teams";
import { askMessage, awaitTeamsDelivery, buildTeamsMessage, canBeAsked, nameWithoutRole, replyMessage, plainText, sendReactionToTeams, reachedTeams, resetTeamsBridge, sendPostToTeams, sendReplyToTeams, syncFromTeams, syncFromTeamsIfStale, teamsMode, teamsSyncMs, withTeamsBridge } from "./teams-bridge";

const CONFIG = { tenant: "example.test", clientId: "dummy", team: "T", channel: "C" };
const FAR = Date.now() + 3_600_000;
let dir: string;
let db: DatabaseSync;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = { url: string; method: string; body: unknown; token: string };

/** Graph の偽物。チーム、チャネル、投稿の一覧に答え、呼ばれた内容を残す。 */
function fakeGraph(messages: unknown[] = [], fail = false) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      token: String((init?.headers as Record<string, string>)?.Authorization ?? ""),
    });
    if (url.endsWith("/me/joinedTeams")) return json({ value: [{ id: "team1", displayName: "T" }] });
    if (url.endsWith("/teams/team1/channels")) return json({ value: [{ id: "chan1", displayName: "C" }] });
    if (method === "POST") return fail ? json({}, 500) : json({ id: `sent-${calls.length}` });
    return json({ value: messages });
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch, spy: fetcher };
}

const posts = (calls: Call[]) => calls.filter((call) => call.method === "POST");

function signIn(person?: string) {
  const name = person ? `teams-token-${person}.json` : "teams-token.json";
  writeFileSync(join(dir, name), JSON.stringify({ accessToken: `token-${person ?? "reader"}`, refreshToken: "r", expiresAt: FAR }));
}

const message = (id: string, name: string, content: string, replies: unknown[] = []) => ({
  id,
  createdDateTime: "2026-11-05T10:00:00Z",
  from: { user: { id: `u-${name}`, displayName: name } },
  body: { content, contentType: "html" },
  replies,
});

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "koekata-bridge-"));
  vi.stubEnv("KOEKATA_GRAPH_DIR", dir);
  vi.stubEnv("KOEKATA_TEAMS", "");
  vi.stubEnv("KOEKATA_TEAMS_WEBHOOK_URL", "");
  writeFileSync(join(dir, "teams.json"), JSON.stringify(CONFIG));
  resetTeamsBridge();
  db = openDatabase(":memory:");
  seedDatabase(db);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("通信しないとき", () => {
  it("KOEKATA_TEAMS=off なら、設定とトークンがあっても通信しない", async () => {
    vi.stubEnv("KOEKATA_TEAMS", "off");
    signIn();
    signIn("saeki");
    const { fetcher, spy } = fakeGraph();
    expect(teamsMode()).toBe("off");
    await sendPostToTeams(db, "saeki", "p", "study", "本文", {}, fetcher);
    await syncFromTeams(db, fetcher);
    await syncFromTeamsIfStale(db, fetcher);
    expect(spy).not.toHaveBeenCalled();
  });

  it("設定がなければ通信せず、投稿先も包まない", async () => {
    rmSync(join(dir, "teams.json"));
    const { fetcher, spy } = fakeGraph();
    const inner = createDummyTeams(db);
    expect(withTeamsBridge(inner, db)).toBe(inner);
    await syncFromTeams(db, fetcher);
    expect(spy).not.toHaveBeenCalled();
  });

  it("試用版では、送る人が決まっていなければ通信しない", () => {
    signIn("saeki");
    expect(teamsMode()).toBe("graph");
    vi.stubEnv("KOEKATA_ACCESS_CODE", "x");
    expect(teamsMode()).toBe("off");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "saeki");
    expect(teamsMode()).toBe("graph");
  });
});

describe("送る", () => {
  it("本人の名前（本人のトークン）で全員向けの投稿を送り、印を残す", async () => {
    signIn("saeki");
    const { calls, fetcher } = fakeGraph();
    await sendPostToTeams(db, "saeki", "p1", "study", "届けたい言葉", {}, fetcher);
    const [sent] = posts(calls);
    expect(sent.url).toContain("/teams/team1/channels/chan1/messages");
    expect(sent.token).toBe("Bearer token-saeki");
    expect(sent.body).toEqual({ body: { contentType: "text", content: "届けたい言葉" } });
    expect(reachedTeams(db, "p1")).toBe(true);
  });

  it("本人がサインインしていなければ、ほかの人のトークンで送らない", async () => {
    signIn();
    signIn("noda");
    const { fetcher, spy } = fakeGraph();
    await sendPostToTeams(db, "saeki", "p1", "study", "本文", {}, fetcher);
    expect(spy).not.toHaveBeenCalled();
  });

  it("範囲を絞った投稿、確認が必要な投稿、教職員だけのチャネルは送らない", async () => {
    signIn("saeki");
    const { fetcher, spy } = fakeGraph();
    await sendPostToTeams(db, "saeki", "a", "study", "本文", { scope: "self" }, fetcher);
    await sendPostToTeams(db, "saeki", "b", "study", "本文", { scope: "managers" }, fetcher);
    await sendPostToTeams(db, "saeki", "c", "study", "本文", { scope: "person", scopePersonId: "noda" }, fetcher);
    await sendPostToTeams(db, "saeki", "d", "study", "本文", { needsLook: true }, fetcher);
    await sendPostToTeams(db, "saeki", "e", "staffroom", "本文", {}, fetcher);
    expect(spy).not.toHaveBeenCalled();
  });

  it("送れなくても例外にせず、ログにトークンを出さない", async () => {
    signIn("saeki");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { fetcher } = fakeGraph([], true);
    await expect(sendPostToTeams(db, "saeki", "p1", "study", "本文", {}, fetcher)).resolves.toEqual({ state: "failed" });
    expect(reachedTeams(db, "p1")).toBe(false);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("token-saeki");
    logged.mockRestore();
  });

  it("投稿先を包んでも、Teams に送れなくてもこえかたには残る", async () => {
    signIn("saeki");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fakeGraph([], true).fetcher);
    const destination = withTeamsBridge(createDummyTeams(db), db);
    const id = destination.createPost("saeki", "study", "残る言葉");
    expect(destination.listPosts("saeki", "study").some((post) => post.id === id)).toBe(true);
    await new Promise((done) => setTimeout(done, 20));
    vi.unstubAllGlobals();
    logged.mockRestore();
  });

  it("Teams に届いた投稿への返信だけを、本人のトークンで送る", async () => {
    signIn("saeki");
    signIn("noda");
    const { calls, fetcher } = fakeGraph();
    // 返信の送り先は、元の投稿のチャネルから決める
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('p1', 'study', 'saeki', 'report', '本文', '2026-11-06T00:00:00Z')").run();
    await sendPostToTeams(db, "saeki", "p1", "study", "本文", {}, fetcher);
    const parent = (db.prepare("SELECT teams_id FROM teams_links WHERE local_id = 'p1'").get() as { teams_id: string }).teams_id;
    await sendReplyToTeams(db, "noda", "r1", "p1", "返事", fetcher);
    const reply = posts(calls).at(-1)!;
    expect(reply.url).toContain(`/messages/${parent}/replies`);
    expect(reply.token).toBe("Bearer token-noda");
    const before = posts(calls).length;
    await sendReplyToTeams(db, "noda", "r2", "local-only", "返事", fetcher);
    expect(posts(calls).length).toBe(before);
  });

  it("予備の Workflow は、設定したときだけカードで送り、失敗のログに URL を出さない", async () => {
    vi.stubEnv("KOEKATA_TEAMS", "webhook");
    expect(teamsMode()).toBe("off");
    vi.stubEnv("KOEKATA_TEAMS_WEBHOOK_URL", "https://example.test/secret-hook");
    expect(teamsMode()).toBe("webhook");
    const { calls, fetcher } = fakeGraph();
    await sendPostToTeams(db, "saeki", "p1", "study", "カードの本文", {}, fetcher);
    const sent = calls[0].body as { attachments: { content: { body: { text: string }[] } }[] };
    expect(sent.attachments[0].content.body.map((block) => block.text)).toEqual(["佐伯 みどり", "カードの本文"]);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await sendPostToTeams(db, "saeki", "p2", "study", "本文", {}, fakeGraph([], true).fetcher);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret-hook");
    logged.mockRestore();
  });
});

describe("読む", () => {
  beforeEach(() => signIn());

  it("投稿と返信を取り込み、HTML は文字だけにする。二度読んでも増えない", async () => {
    const messages = [message("m1", "佐伯 みどり", "<p>最初の<b>工夫</b> &amp; 気づき</p>", [message("r1", "大河原 誠", "<p>真似します</p>")])];
    await syncFromTeams(db, fakeGraph(messages).fetcher);
    await syncFromTeams(db, fakeGraph(messages).fetcher);
    const rows = db.prepare("SELECT body, author_id, channel_id FROM posts WHERE body LIKE '最初の%'").all();
    expect(rows).toEqual([{ body: "最初の工夫 & 気づき", author_id: "saeki", channel_id: "study" }]);
    expect(db.prepare("SELECT author_id FROM replies WHERE body = '真似します'").all()).toEqual([{ author_id: "ogawara" }]);
  });

  it("Teams で書かれた返事が、投稿した本人の知らせに出る", async () => {
    signIn("saeki");
    const send = fakeGraph();
    const post = createDummyTeams(db).createPost("saeki", "study", "こえかたからの言葉");
    await sendPostToTeams(db, "saeki", post, "study", "こえかたからの言葉", {}, send.fetcher);
    const teamsId = (db.prepare("SELECT teams_id FROM teams_links WHERE local_id = ?").get(post) as { teams_id: string }).teams_id;
    await syncFromTeams(db, fakeGraph([message(teamsId, "佐伯 みどり", "こえかたからの言葉", [message("r1", "大河原 誠", "それ真似します")])]).fetcher);
    expect(listReplyNotices(db, "saeki").map((notice) => [notice.authorName, notice.body])).toEqual([["大河原 誠", "それ真似します"]]);
    expect(db.prepare("SELECT count(*) AS c FROM posts WHERE body = 'こえかたからの言葉'").get()).toEqual({ c: 1 });
  });

  it("送った直後で印がまだない投稿を、二重に取り込まない", async () => {
    createDummyTeams(db).createPost("saeki", "study", "同じ言葉");
    await syncFromTeams(db, fakeGraph([message("m9", "佐伯 みどり", "同じ言葉")]).fetcher);
    expect(db.prepare("SELECT count(*) AS c FROM posts WHERE body = '同じ言葉'").get()).toEqual({ c: 1 });
  });

  it("本文のないカードと、対応する人がいない投稿は取り込まない", async () => {
    const before = db.prepare("SELECT count(*) AS c FROM posts").get();
    await syncFromTeams(
      db,
      fakeGraph([
        { id: "w1", createdDateTime: "2026-11-05T10:00:00Z", from: { application: { displayName: "Workflows" } }, body: { content: "" } },
        message("x1", "知らない人", "本文"),
      ]).fetcher,
    );
    expect(db.prepare("SELECT count(*) AS c FROM posts").get()).toEqual(before);
  });

  it("サインインの記録があれば、名前より優先して人物を決める", async () => {
    writeFileSync(join(dir, "teams-people.json"), JSON.stringify({ "u-こえかたデモ": "noda" }));
    await syncFromTeams(db, fakeGraph([message("m2", "こえかたデモ", "デモの言葉")]).fetcher);
    expect(db.prepare("SELECT author_id FROM posts WHERE body = 'デモの言葉'").all()).toEqual([{ author_id: "noda" }]);
  });

  it("画面からの取り込みは間隔を空け、失敗しても例外にしない", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn(async () => json({}, 500));
    await syncFromTeamsIfStale(db, failing as unknown as typeof fetch, 1_000_000);
    const count = failing.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    await syncFromTeamsIfStale(db, failing as unknown as typeof fetch, 1_000_001);
    expect(failing.mock.calls.length).toBe(count);
    logged.mockRestore();
  });
});

describe("送った結果", () => {
  const sendVia = (fetcher: typeof fetch, options = {}, viewer = "saeki", channel = "study") =>
    sendPostToTeams(db, viewer, "p1", channel, "本文", options, fetcher);

  it("届いたとき、範囲を絞ったとき、サインインがないとき、失敗したときを分けて返す", async () => {
    signIn("saeki");
    expect(await sendVia(fakeGraph().fetcher)).toEqual({ state: "sent" });
    expect(await sendVia(fakeGraph().fetcher, { scope: "self" })).toEqual({ state: "skipped", reason: "scope" });
    expect(await sendVia(fakeGraph().fetcher, {}, "noda")).toEqual({ state: "skipped", reason: "signin" });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendVia(fakeGraph([], true).fetcher)).toEqual({ state: "failed" });
    logged.mockRestore();
  });

  it("サインインの更新を断られたときは、その理由と番号を返す（サインインしていない、とは言わない）", async () => {
    signIn("saeki");
    writeFileSync(join(dir, "teams-token-saeki.json"), JSON.stringify({ accessToken: "old", refreshToken: "r", expiresAt: 0 }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const denied = vi.fn(async () => json({ error: "invalid_grant", error_codes: [530035] }, 400)) as unknown as typeof fetch;
    expect(await sendVia(denied)).toEqual({ state: "skipped", reason: "refresh", code: "AADSTS530035" });
    logged.mockRestore();
  });

  it("確認の印と、教職員だけのチャネルは、理由を分けずに校内だけとして返す", async () => {
    signIn("saeki");
    const needsLook = await sendVia(fakeGraph().fetcher, { needsLook: true });
    const staff = await sendVia(fakeGraph().fetcher, {}, "saeki", "staffroom");
    expect(needsLook).toEqual({ state: "skipped", reason: "kept" });
    expect(staff).toEqual(needsLook);
  });

  it("KOEKATA_TEAMS=off なら off を返す", async () => {
    vi.stubEnv("KOEKATA_TEAMS", "off");
    expect(await sendVia(fakeGraph().fetcher)).toEqual({ state: "off" });
  });

  it("包んだ投稿先の結果を受け取れて、遅いときは確認中を返す", async () => {
    signIn("saeki");
    vi.stubGlobal("fetch", fakeGraph().fetcher);
    const destination = withTeamsBridge(createDummyTeams(db), db);
    const id = destination.createPost("saeki", "study", "届く言葉");
    expect(await awaitTeamsDelivery(id)).toEqual({ state: "sent" });
    vi.stubGlobal("fetch", (() => new Promise(() => undefined)) as unknown as typeof fetch);
    resetTeamsBridge();
    const slow = destination.createPost("saeki", "study", "遅い言葉");
    expect(await awaitTeamsDelivery(slow, 10)).toEqual({ state: "pending" });
    vi.unstubAllGlobals();
    expect(await awaitTeamsDelivery("unknown")).toEqual({ state: "off" });
  });

  it("取り込みの間隔は環境変数で変えられ、おかしな値は既定に戻す", () => {
    expect(teamsSyncMs()).toBe(30_000);
    vi.stubEnv("KOEKATA_TEAMS_SYNC_MS", "5000");
    expect(teamsSyncMs()).toBe(5000);
    vi.stubEnv("KOEKATA_TEAMS_SYNC_MS", "1");
    expect(teamsSyncMs()).toBe(30_000);
  });
});

describe("チャネルの対応表", () => {
  // チームが2つ（全校と教職員）あるテナントの偽物
  function mappedGraph(messagesByChannel: Record<string, unknown[]> = {}) {
    const calls: Call[] = [];
    const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null, token: "" });
      if (url.endsWith("/me/joinedTeams")) return json({ value: [{ id: "school", displayName: "全校" }, { id: "staff", displayName: "教職員" }] });
      if (url.endsWith("/teams/school/channels")) return json({ value: [{ id: "c-study", displayName: "勉強会" }, { id: "c-clubs", displayName: "部活" }] });
      if (url.endsWith("/teams/staff/channels")) return json({ value: [{ id: "c-room", displayName: "職員室" }] });
      if (method === "POST") return json({ id: `sent-${calls.length}` });
      const channel = url.match(/channels\/([^/]+)\/messages/)?.[1] ?? "";
      return json({ value: messagesByChannel[channel] ?? [] });
    });
    return { calls, fetcher: fetcher as unknown as typeof fetch };
  }

  beforeEach(() => {
    const channels = { study: { team: "全校", channel: "勉強会" }, clubs: { team: "全校", channel: "部活" }, staffroom: { team: "教職員", channel: "職員室" } };
    writeFileSync(join(dir, "teams.json"), JSON.stringify({ ...CONFIG, channels }));
  });

  it("アプリのチャネルごとに送り先を変え、教職員だけのチャネルは教職員のチームへ送る", async () => {
    signIn("saeki");
    const { calls, fetcher } = mappedGraph();
    expect(await sendPostToTeams(db, "saeki", "p1", "clubs", "部活の話", {}, fetcher)).toEqual({ state: "sent" });
    expect(await sendPostToTeams(db, "saeki", "p2", "staffroom", "職員室の話", {}, fetcher)).toEqual({ state: "sent" });
    const sent = posts(calls).map((call) => call.url);
    expect(sent[0]).toContain("/teams/school/channels/c-clubs/messages");
    expect(sent[1]).toContain("/teams/staff/channels/c-room/messages");
  });

  it("対応表にないチャネルは、アプリの中に残す", async () => {
    signIn("saeki");
    const { calls, fetcher } = mappedGraph();
    expect(await sendPostToTeams(db, "saeki", "p1", "making", "作ったもの", {}, fetcher)).toEqual({ state: "skipped", reason: "kept" });
    expect(posts(calls)).toHaveLength(0);
  });

  it("全部のチャネルから読み、取り込んだ投稿は元のチャネルに入れる", async () => {
    signIn();
    const { fetcher } = mappedGraph({
      "c-clubs": [message("m1", "佐伯 みどり", "<p>部活で新記録</p>")],
      "c-room": [message("m2", "佐伯 みどり", "<p>職員室への連絡</p>")],
    });
    await syncFromTeams(db, fetcher);
    const channelOf = (body: string) => (db.prepare("SELECT channel_id FROM posts WHERE body = ?").get(body) as { channel_id: string } | undefined)?.channel_id;
    expect(channelOf("部活で新記録")).toBe("clubs");
    expect(channelOf("職員室への連絡")).toBe("staffroom");
  });
});

describe("いいねとリアクション", () => {
  it("アプリのいいねを、Teams に届いた投稿へ本人の名前のリアクションで付け、外したら外す", async () => {
    signIn("noda");
    const { calls, fetcher } = fakeGraph();
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('p1', 'study', 'saeki', 'report', '本文', '2026-11-06T00:00:00Z')").run();
    signIn("saeki");
    await sendPostToTeams(db, "saeki", "p1", "study", "本文", {}, fetcher);
    await sendReactionToTeams(db, "noda", "p1", true, fetcher);
    await sendReactionToTeams(db, "noda", "p1", false, fetcher);
    const reactions = posts(calls).slice(-2);
    expect(reactions[0].url).toMatch(/\/setReaction$/);
    expect(reactions[1].url).toMatch(/\/unsetReaction$/);
    expect(reactions[0].token).toBe("Bearer token-noda");
    expect(reactions[0].body).toEqual({ reactionType: "👍" });
  });

  it("Teams に届いていない投稿には送らない", async () => {
    signIn("noda");
    const { calls, fetcher } = fakeGraph();
    await sendReactionToTeams(db, "noda", "local-only", true, fetcher);
    expect(calls).toHaveLength(0);
  });

  it("Teams で付いたリアクションを、アプリのいいねとして取り込む。本人のいいねは数えない", async () => {
    signIn();
    const withReactions = {
      ...message("m-like", "佐伯 みどり", "<p>リアクションの付いた投稿</p>"),
      reactions: [
        { reactionType: "like", user: { user: { id: "u-野田 翔", displayName: "野田 翔" } } },
        { reactionType: "heart", user: { user: { id: "u-佐伯 みどり", displayName: "佐伯 みどり" } } },
      ],
    };
    await syncFromTeams(db, fakeGraph([withReactions]).fetcher);
    const post = db.prepare("SELECT id FROM posts WHERE body = ?").get("リアクションの付いた投稿") as { id: string };
    const likers = (db.prepare("SELECT person_id FROM post_likes WHERE post_id = ?").all(post.id) as { person_id: string }[]).map((row) => row.person_id);
    expect(likers).toEqual(["noda"]);
  });
});

describe("名前の照合", () => {
  it("末尾の役割の括弧を外して、ダミーの人物と比べる", async () => {
    expect(nameWithoutRole("白石 文（養護教諭）")).toBe("白石 文");
    expect(nameWithoutRole("佐伯 みどり（国語・2年担任）")).toBe("佐伯 みどり");
    expect(nameWithoutRole("青木 ひより")).toBe("青木 ひより");
    signIn();
    const { fetcher } = fakeGraph([message("m-role", "川村 陽菜（理科・2年目）", "<p>理科室の予約の話</p>")]);
    // 名前で照合させるため、サインインの記録の ID とは別の人にする
    await syncFromTeams(db, fetcher);
    const row = db.prepare("SELECT author_id FROM posts WHERE body = ?").get("理科室の予約の話") as { author_id: string } | undefined;
    expect(row?.author_id).toBe("kawamura");
  });
});

describe("文字にする", () => {
  it("改行を残し、タグを消す", () => {
    expect(plainText("<p>一行目</p><p>二行目<br/>三行目</p>")).toBe("一行目\n二行目\n三行目");
    expect(plainText('<attachment id="x"></attachment>')).toBe("");
  });
});

describe("メンション（0-2g）", () => {
  const linkPeople = (map: Record<string, string>) => writeFileSync(join(dir, "teams-people.json"), JSON.stringify(map));
  const mentionOf = (teamsUserId: string, name: string) => ({ id: 0, mentionText: name, mentioned: { user: { id: teamsUserId, displayName: name } } });
  const mentioned = (id: string, name: string, content: string, mentions: unknown[], replies: unknown[] = []) => ({ ...message(id, name, content, replies), mentions });
  const askedOf = (body: string) =>
    (db.prepare("SELECT asked_person_id FROM posts WHERE body = ?").get(body) as { asked_person_id: string | null } | undefined)?.asked_person_id;

  it("@名前を、本文の <at> と mentions の組にする。本文の HTML は逃がし、改行は <br> にする", () => {
    expect(buildTeamsMessage("@大河原 誠さん\n<b>a & b</b>", [{ name: "大河原 誠", teamsUserId: "u-oga" }])).toEqual({
      body: { contentType: "html", content: '<at id="0">大河原 誠</at>さん<br>&lt;b&gt;a &amp; b&lt;/b&gt;' },
      mentions: [{ id: 0, mentionText: "大河原 誠", mentioned: { user: { id: "u-oga", displayName: "大河原 誠", userIdentityType: "aadUser" } } }],
    });
  });

  it("Teams の ID が分からない相手は、メンションにせず名前だけを書く", () => {
    expect(buildTeamsMessage("@野田 翔さん、どうですか？", [{ name: "野田 翔", teamsUserId: null }])).toEqual({
      body: { contentType: "text", content: "野田 翔さん、どうですか？" },
    });
  });

  it("聞いてみるの投稿は、頭で相手をメンションして送る", async () => {
    signIn("saeki");
    linkPeople({ "u-saeki": "saeki", "u-oga": "ogawara" });
    const { calls, fetcher } = fakeGraph();
    await sendPostToTeams(db, "saeki", "p1", "study", "英語の音読、どうしてますか？", { askedPersonId: "ogawara" }, fetcher);
    const [sent] = posts(calls);
    expect(sent.body).toEqual({
      body: { contentType: "html", content: '<at id="0">大河原 誠</at>さん<br>英語の音読、どうしてますか？' },
      mentions: [{ id: 0, mentionText: "大河原 誠", mentioned: { user: { id: "u-oga", displayName: "大河原 誠", userIdentityType: "aadUser" } } }],
    });
  });

  it("聞いてみるの相手の ID が分からなければ、メンションなしで名前を頭に書く", () => {
    linkPeople({ "u-saeki": "saeki" });
    expect(askMessage(db, "教えてください", "ogawara")).toEqual({ body: { contentType: "text", content: "大河原 誠さん\n教えてください" } });
    expect(askMessage(db, "ふつうの投稿", undefined)).toEqual({ body: { contentType: "text", content: "ふつうの投稿" } });
  });

  it("範囲を絞った聞いてみるは、Teams へもメンションも送らない", async () => {
    signIn("saeki");
    linkPeople({ "u-oga": "ogawara" });
    const { fetcher, spy } = fakeGraph();
    await sendPostToTeams(db, "saeki", "p1", "study", "本文", { askedPersonId: "ogawara", scope: "person", scopePersonId: "ogawara" }, fetcher);
    expect(spy).not.toHaveBeenCalled();
  });

  it("返事の @名前 は、その投稿を見られる人だけメンションにする（生徒に職員室を渡さない）", () => {
    linkPeople({ "u-oga": "ogawara", "u-aoki": "aoki" });
    const inStudy = replyMessage(db, "saeki", "study", "@大河原 誠さん、@青木 ひよりさん、どうですか？");
    expect(inStudy.mentions?.map((m) => m.mentioned?.user?.id).sort()).toEqual(["u-aoki", "u-oga"]);
    const inStaff = replyMessage(db, "saeki", "staffroom", "@大河原 誠さん、@青木 ひよりさん、どうですか？");
    expect(inStaff.mentions?.map((m) => m.mentioned?.user?.id)).toEqual(["u-oga"]);
    expect(inStaff.body.content).toContain("@青木 ひより");
    expect(canBeAsked(db, "aoki", "staffroom")).toBe(false);
    expect(canBeAsked(db, "aoki", "study")).toBe(true);
  });

  it("回すの返事は、元の投稿への返事として新しい人をメンションする", async () => {
    signIn("saeki");
    linkPeople({ "u-noda": "noda" });
    const { calls, fetcher } = fakeGraph();
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('p1', 'study', 'kawamura', 'report', '相談', '2026-11-06T00:00:00Z')").run();
    await sendPostToTeams(db, "saeki", "p1", "study", "相談", {}, fetcher);
    await sendReplyToTeams(db, "saeki", "r1", "p1", "@野田 翔さん、詳しいと思って、つなぎました。どうですか？", fetcher);
    const reply = posts(calls).at(-1)!;
    expect(reply.url).toContain("/replies");
    expect(reply.body).toMatchObject({ body: { contentType: "html", content: '<at id="0">野田 翔</at>さん、詳しいと思って、つなぎました。どうですか？' } });
  });

  describe("取り込み", () => {
    beforeEach(() => {
      signIn();
      linkPeople({ "u-saeki": "saeki", "u-oga": "ogawara", "u-aoki": "aoki" });
    });

    it("Teams で直接メンションされた投稿は、メンションされた人の受信箱に入る", async () => {
      await syncFromTeams(db, fakeGraph([mentioned("m1", "佐伯 みどり", '<at id="0">大河原 誠</at> 教えてください', [mentionOf("u-oga", "大河原 誠")])]).fetcher);
      expect(askedOf("大河原 誠 教えてください")).toBe("ogawara");
    });

    it("返事の中のメンションも受信箱に入り、今のお願いの相手が回したならパスとして残る", async () => {
      const reply = mentioned("r1", "佐伯 みどり", '<at id="0">大河原 誠</at>さん、どうですか？', [mentionOf("u-oga", "大河原 誠")]);
      const post = mentioned("m1", "青木 ひより", '<at id="0">佐伯 みどり</at> 質問です', [mentionOf("u-saeki", "佐伯 みどり")], [reply]);
      await syncFromTeams(db, fakeGraph([post]).fetcher);
      expect(askedOf("佐伯 みどり 質問です")).toBe("ogawara");
      expect(db.prepare("SELECT from_person_id, to_person_id FROM post_passes").all()).toEqual([{ from_person_id: "saeki", to_person_id: "ogawara" }]);
    });

    it("メンションを見るのは初めて取り込むときだけ（あとで回したお願いを戻さない）", async () => {
      const graphMessages = [mentioned("m1", "佐伯 みどり", '<at id="0">大河原 誠</at> 一度だけ', [mentionOf("u-oga", "大河原 誠")])];
      await syncFromTeams(db, fakeGraph(graphMessages).fetcher);
      db.prepare("UPDATE posts SET asked_person_id = 'noda' WHERE body = ?").run("大河原 誠 一度だけ");
      await syncFromTeams(db, fakeGraph(graphMessages).fetcher);
      expect(askedOf("大河原 誠 一度だけ")).toBe("noda");
    });

    it("生徒は、生徒が見られないチャネルでメンションされても受信箱に入らない", async () => {
      writeFileSync(join(dir, "teams.json"), JSON.stringify({ ...CONFIG, localChannel: "staffroom" }));
      await syncFromTeams(db, fakeGraph([mentioned("m1", "佐伯 みどり", '<at id="0">青木 ひより</at> 職員室の話', [mentionOf("u-aoki", "青木 ひより")])]).fetcher);
      expect(askedOf("青木 ひより 職員室の話")).toBeNull();
    });

    it("自分で自分をメンションしても、受信箱には入らない", async () => {
      await syncFromTeams(db, fakeGraph([mentioned("m1", "佐伯 みどり", '<at id="0">佐伯 みどり</at> メモ', [mentionOf("u-saeki", "佐伯 みどり")])]).fetcher);
      expect(askedOf("佐伯 みどり メモ")).toBeNull();
    });

    it("取り込みでは何も送らない（メンションは本人が送るときだけ）", async () => {
      const { calls, fetcher } = fakeGraph([mentioned("m1", "佐伯 みどり", '<at id="0">大河原 誠</at> 読むだけ', [mentionOf("u-oga", "大河原 誠")])]);
      await syncFromTeams(db, fetcher);
      expect(posts(calls)).toEqual([]);
    });

    it("メンションを付けて送った直後の投稿を、印がなくても二重に取り込まない", async () => {
      createDummyTeams(db).createPost("saeki", "study", "二重にしない質問", { askedPersonId: "ogawara" });
      await syncFromTeams(db, fakeGraph([mentioned("m9", "佐伯 みどり", '<at id="0">大河原 誠</at>さん<br>二重にしない質問', [mentionOf("u-oga", "大河原 誠")])]).fetcher);
      expect(db.prepare("SELECT count(*) AS c FROM posts WHERE body LIKE '%二重にしない質問'").get()).toEqual({ c: 1 });
    });
  });
});
