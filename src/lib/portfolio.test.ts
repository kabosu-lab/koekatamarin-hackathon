import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { handlePublish, handleUndo } from "./compose-request";
import { listReceived } from "./daily";
import { openDatabase } from "./db";
import { getDestination } from "./destination/current";
import { collectMaterial, periodStart } from "./lookback";
import { getPortfolio, handlePortfolio, listTerms, parseTerm, portfolioSystemPrompt, termIdOf } from "./portfolio";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T09:00:00Z");
const TERM = "2026-2";
const scripted = createScriptedClaude();
const options = { rewards: true, now: NOW };
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

const view = (personId: string, term = TERM, rewards = true) => getPortfolio(db, personId, parseTerm(term)!, { rewards });
const act = (personId: string, input: Record<string, unknown>, claude: ClaudeClient = scripted, rewards = true) =>
  handlePortfolio(claude, db, personId, { term: TERM, ...input }, { rewards, now: NOW });
const count = (table: string) => (db.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;

function giveTrophy(personId: string, id: string) {
  db.prepare("INSERT INTO person_ribbons (person_id, ribbon_id, earned_at, story, story_at) VALUES (?, ?, ?, ?, ?)").run(
    personId,
    id,
    NOW.toISOString(),
    "木下さんの役に立った日",
    NOW.toISOString(),
  );
}

function addThanks(id: string, from: string, to: string, message: string) {
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(id, from, to, message, NOW.toISOString());
}

function addPost(id: string, author: string, channel: string, body: string, scope = "everyone") {
  db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at, scope) VALUES (?, ?, ?, 'report', ?, ?, ?)").run(
    id,
    channel,
    author,
    body,
    NOW.toISOString(),
    scope,
  );
}

describe("学期", () => {
  it("日本の日付で区切り、ふりかえりの学期の始まりとそろう", () => {
    for (const at of ["2026-05-01T01:00:00Z", "2026-11-04T09:00:00Z", "2027-02-01T01:00:00Z"]) {
      const now = new Date(at);
      expect(parseTerm(termIdOf(now))?.start).toBe(periodStart("term", now));
    }
    // 8/31 15:00 UTC は日本では 9/1
    expect(termIdOf(new Date("2026-08-31T14:59:00Z"))).toBe("2026-1");
    expect(termIdOf(new Date("2026-08-31T15:00:00Z"))).toBe("2026-2");
    expect(termIdOf(new Date("2027-03-31T14:59:00Z"))).toBe("2026-3");
    expect(termIdOf(new Date("2027-03-31T15:00:00Z"))).toBe("2027-1");
  });

  it("学期の範囲はすき間なくつながり、形の違う値は受け付けない", () => {
    expect(parseTerm("2026-1")?.end).toBe(parseTerm("2026-2")?.start);
    expect(parseTerm("2026-2")?.end).toBe(parseTerm("2026-3")?.start);
    expect(parseTerm("2026-3")?.end).toBe(parseTerm("2027-1")?.start);
    for (const bad of ["2026-4", "x", "2026-2'; DROP", 1, null]) expect(parseTerm(bad)).toBeNull();
  });

  it("先の学期は選べない", async () => {
    expect(listTerms(db, "saeki", NOW)[0].id).toBe(TERM);
    const outcome = await act("saeki", { action: "reflect", term: "2027-1" });
    expect(outcome.status).toBe(400);
  });

  it("前の学期まで記録があれば選べて、新しい順に並ぶ", () => {
    addPost("old", "saeki", "study", "1学期の投稿");
    db.prepare("UPDATE posts SET created_at = ? WHERE id = 'old'").run("2026-05-01T00:00:00.000Z");
    expect(listTerms(db, "saeki", NOW).map((t) => t.id)).toEqual(["2026-2", "2026-1"]);
  });
});

describe("たまった日報と日記", () => {
  it("本人の分だけが、その学期の分だけ、自動で入る", () => {
    const text = JSON.stringify(view("saeki").days);
    expect(text).toContain("いいところを一つだけ");
    expect(text).not.toContain("ITパスポート");
    expect(view("saeki", "2026-1").days).toEqual([]);
  });

  it("チェックしていない項目も本人には見えるが、チェックは変わらず、誰にも届かない", async () => {
    const before = db.prepare("SELECT id, checked FROM report_items ORDER BY id").all();
    const item = view("saeki").days[0].items[0];
    await act("saeki", { action: "share-draft", picks: [`daily:${item.id}`] });
    expect(item.text).not.toBe("");
    expect(db.prepare("SELECT id, checked FROM report_items ORDER BY id").all()).toEqual(before);
    expect(listReceived(db, "fujimoto").filter((r) => r.personName.startsWith("佐伯"))).toEqual([]);
  });
});

describe("本人が選んで足す", () => {
  it("初めは何も足されていない", () => {
    expect(view("kawamura").added).toEqual([]);
    expect(count("portfolio_items")).toBe(0);
  });

  it("投稿、ありがとう、知恵、トロフィーを足せて、外せる", async () => {
    addThanks("t1", "noda", "kawamura", "助かりました");
    giveTrophy("kawamura", "first-answer");
    const kinds = ["post", "thanks", "knowledge", "trophy"];
    for (const kind of kinds) {
      const entry = view("kawamura").candidates.find((c) => c.kind === kind);
      expect(entry, kind).toBeDefined();
      expect((await act("kawamura", { action: "add", kind, ref: entry?.ref })).status).toBe(200);
    }
    const { added } = view("kawamura");
    expect(added.map((e) => e.kind).sort()).toEqual([...kinds].sort());
    expect((await act("kawamura", { action: "remove", kind: "thanks", ref: "t1" })).status).toBe(200);
    expect(view("kawamura").added.some((e) => e.kind === "thanks")).toBe(false);
    expect(view("kawamura").candidates.some((e) => e.ref === "t1")).toBe(true);
  });

  it("人のものは足せない", async () => {
    addThanks("t-other", "noda", "saeki", "佐伯先生へ");
    addPost("limited", "saeki", "study", "佐伯先生の絞った投稿", "self");
    giveTrophy("saeki", "first-answer");
    const cases = [
      { kind: "post", ref: "limited" },
      { kind: "post", ref: "post-staff-2" },
      { kind: "thanks", ref: "t-other" },
      { kind: "trophy", ref: "first-answer" },
      { kind: "knowledge", ref: "no-such" },
      { kind: "other", ref: "x" },
    ];
    for (const input of cases) {
      expect((await act("kawamura", { action: "add", ...input })).status, JSON.stringify(input)).toBe(404);
    }
    expect(count("portfolio_items")).toBe(0);
  });

  it("確認中の知恵と、名前を外した知恵は足せない", async () => {
    const entry = view("kawamura").candidates.find((c) => c.kind === "knowledge");
    db.prepare("UPDATE knowledge_contributors SET state = 'removed' WHERE item_id = ? AND person_id = 'kawamura'").run(entry?.ref ?? "");
    expect((await act("kawamura", { action: "add", kind: "knowledge", ref: entry?.ref })).status).toBe(404);
    const other = view("kawamura").candidates.find((c) => c.kind === "knowledge");
    db.prepare("UPDATE knowledge_items SET status = 'confirming' WHERE id = ?").run(other?.ref ?? "");
    expect(view("kawamura").candidates.some((c) => c.ref === other?.ref)).toBe(false);
  });

  it("足したものは他の人の画面にも、届いた日報にも出ない", async () => {
    addThanks("t1", "noda", "kawamura", "助かりました");
    await act("kawamura", { action: "add", kind: "thanks", ref: "t1" });
    await act("kawamura", { action: "save-reflection", text: "川村のふりかえり" });
    for (const other of ["saeki", "fujimoto", "aoki"]) {
      const shown = JSON.stringify(view(other));
      expect(shown).not.toContain("助かりました");
      expect(shown).not.toContain("川村のふりかえり");
      expect(JSON.stringify(listReceived(db, other))).not.toContain("川村のふりかえり");
    }
  });

  it("本文を写さないので、投稿を取り消すとポートフォリオからも消える", async () => {
    const teams = getDestination(db);
    const postId = teams.createPost("aoki", "study", "取り消す投稿", {});
    db.prepare("UPDATE posts SET created_at = ? WHERE id = ?").run(NOW.toISOString(), postId);
    await act("aoki", { action: "add", kind: "post", ref: postId });
    expect(view("aoki").added.map((e) => e.text)).toContain("取り消す投稿");
    expect(JSON.stringify(db.prepare("SELECT * FROM portfolio_items").all())).not.toContain("取り消す投稿");
    db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
    expect(view("aoki").added).toEqual([]);
  });

  it("画面へ渡す値に、いいねの数、順位、確認の印を入れない", async () => {
    const shown = JSON.stringify(view("kawamura"));
    for (const word of ["likeCount", "rank", "score", "needsLook", "needs_look", "shared_to_staff"]) expect(shown).not.toContain(word);
  });

  it("報酬を隠している人にはトロフィーを出さず、足せない", async () => {
    giveTrophy("kawamura", "first-answer");
    expect(view("kawamura", TERM, false).candidates.some((c) => c.kind === "trophy")).toBe(false);
    expect((await act("kawamura", { action: "add", kind: "trophy", ref: "first-answer" }, scripted, false)).status).toBe(404);
  });
});

describe("学期のふりかえり", () => {
  it("書いてもらうだけでは残らず、本人が押すと残り、消せる", async () => {
    const outcome = await act("saeki", { action: "reflect" });
    expect(outcome.body).toMatchObject({ ready: true });
    expect(count("portfolio_reflections")).toBe(0);
    await act("saeki", { action: "save-reflection", text: "  直した文章  " });
    expect(view("saeki").reflection).toBe("直した文章");
    await act("saeki", { action: "save-reflection", text: "もう一度直した" });
    expect(view("saeki").reflection).toBe("もう一度直した");
    await act("saeki", { action: "delete-reflection" });
    expect(view("saeki").reflection).toBeNull();
  });

  it("空や長すぎる言葉は残さない", async () => {
    expect((await act("saeki", { action: "save-reflection", text: " " })).status).toBe(400);
    expect((await act("saeki", { action: "save-reflection", text: "あ".repeat(4001) })).status).toBe(400);
  });

  it("その学期の材料だけで、話した言葉や命や安全の知らせを材料に入れない。評価を断定しない決まりがある", async () => {
    db.prepare("INSERT INTO safety_alerts (id, person_id, summary, created_at, updated_at) VALUES ('a', 'saeki', '相談室への要点', ?, ?)").run(NOW.toISOString(), NOW.toISOString());
    addPost("later", "saeki", "study", "来学期の投稿");
    db.prepare("UPDATE posts SET created_at = '2027-01-10T00:00:00.000Z' WHERE id = 'later'").run();
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ ready: true, text: "x" }), refused: false };
      },
    };
    await act("saeki", { action: "reflect", conversation: [{ role: "user", content: "話した言葉" }] }, recording);
    const sent = requests[0].messages[0].content;
    expect(sent).toContain("いいところを一つだけ");
    expect(sent).not.toContain("話した言葉");
    expect(sent).not.toContain("相談室への要点");
    expect(sent).not.toContain("来学期の投稿");
    expect(requests[0].system).toBe(portfolioSystemPrompt);
    expect(requests[0].system).toContain("結果や評価を断定しない");
    expect(requests[0].system).toContain("順位、点数、回数で測らない");
    expect(requests[0].system).toContain("出来事、気持ち、成果、数字を作らない");
  });

  it("学期の終わりで材料を区切る", () => {
    const term = parseTerm("2026-2")!;
    addPost("later", "saeki", "study", "来学期の投稿");
    db.prepare("UPDATE posts SET created_at = ? WHERE id = 'later'").run(term.end);
    expect(collectMaterial(db, "saeki", term.start, term.end).join("\n")).not.toContain("来学期の投稿");
    expect(collectMaterial(db, "saeki", term.start).join("\n")).toContain("来学期の投稿");
  });

  it("材料がなければ Claude を呼ばず、失敗は伝える", async () => {
    const complete = vi.fn();
    const empty = await handlePortfolio({ mode: "real", complete }, db, "fujimoto", { term: "2027-1", action: "reflect" }, { rewards: true, now: new Date("2027-05-01T01:00:00Z") });
    expect(empty.body).toEqual({ ready: false, text: "" });
    expect(complete).not.toHaveBeenCalled();

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    expect((await act("saeki", { action: "reflect" }, refused)).status).toBe(503);
    log.mockRestore();
  });
});

describe("Teams へ届ける", () => {
  async function added(personId: string, kind: string, ref: string) {
    expect((await act(personId, { action: "add", kind, ref })).status).toBe(200);
  }
  const draft = (personId: string, picks: unknown) => act(personId, { action: "share-draft", picks });

  it("ポートフォリオを作り、足し、下書きにしても、投稿は増えない", async () => {
    const before = count("posts");
    const postId = view("kawamura").candidates.find((c) => c.kind === "post" && c.shareable)?.ref ?? "";
    await added("kawamura", "post", postId);
    await act("kawamura", { action: "reflect" });
    await act("kawamura", { action: "save-reflection", text: "残した" });
    const outcome = await draft("kawamura", [`post:${postId}`]);
    expect(outcome.status).toBe(200);
    expect(count("posts")).toBe(before);
  });

  it("本人が選ばないと下書きを作らない", async () => {
    expect((await draft("kawamura", [])).status).toBe(400);
    expect((await draft("kawamura", undefined)).status).toBe(400);
  });

  it("ありがとう、絞った投稿、教職員だけのチャネルの投稿、本人だけのトロフィー、足していないものは下書きにできない", async () => {
    addThanks("t1", "noda", "saeki", "送り主だけが知る言葉");
    addPost("limited", "saeki", "study", "絞った話", "managers");
    giveTrophy("saeki", "trusted");
    for (const [kind, ref] of [["thanks", "t1"], ["post", "limited"], ["post", "post-staff-2"], ["trophy", "trusted"]]) {
      await added("saeki", kind, ref);
      const outcome = await draft("saeki", [`${kind}:${ref}`]);
      expect(outcome.status, `${kind}:${ref}`).toBe(400);
      expect(outcome.body.draft).toBeUndefined();
    }
    addPost("not-added", "saeki", "study", "足していない投稿");
    expect((await draft("saeki", ["post:not-added"])).status).toBe(400);
    expect((await draft("saeki", ["post:post-study-1"])).status).toBe(400);
  });

  it("画面でも、届けられないものに印が付く", async () => {
    addThanks("t1", "noda", "saeki", "言葉");
    addPost("limited", "saeki", "study", "絞った話", "self");
    const shareable = (ref: string) => view("saeki").candidates.find((c) => c.ref === ref)?.shareable;
    expect(shareable("t1")).toBe(false);
    expect(shareable("limited")).toBe(false);
    expect(shareable("post-staff-2")).toBe(false);
  });

  it("トロフィーは名前だけで、物語と隠しトロフィーの条件を書かない", async () => {
    giveTrophy("saeki", "mentor");
    await added("saeki", "trophy", "mentor");
    const { status, body } = await draft("saeki", ["trophy:mentor"]);
    expect(status).toBe(200);
    expect(body.draft).toContain("師弟");
    expect(body.draft).not.toContain("木下さん");
    expect(body.draft).not.toContain("自分が助けた人");
  });

  it("確かめた下書きは getDestination を通して本人の名前で届き、取り消せる", async () => {
    const postId = view("aoki").candidates.find((c) => c.ref === "post-study-1")?.ref ?? "";
    await added("aoki", "post", postId);
    const item = view("aoki").days[0].items[0];
    const { body } = await draft("aoki", [`daily:${item.id}`, `post:${postId}`]);
    const text = body.draft as string;
    expect(text).toContain("2026年度 2学期");
    expect(text).toContain(item.text);

    const teams = getDestination(db);
    const sent = await handlePublish(scripted, teams, "aoki", { text, channelId: "study", kind: "report", scope: "everyone" }, db);
    expect(sent.status).toBe(200);
    const id = (sent.body as { postId: string }).postId;
    const post = teams.listPosts("saeki", "study").find((p) => p.id === id);
    expect(post?.authorName).toBe("青木 ひより");
    expect(handleUndo(teams, "aoki", { postId: id }, new Date(), db).status).toBe(200);
    expect(teams.listPosts("saeki", "study").some((p) => p.id === id)).toBe(false);
  });

  it("送るときは今までの関門を通る。個人攻撃は止まり、気になる言葉は教職員の確認に回る", async () => {
    const teams = getDestination(db);
    const blocked = await handlePublish(scripted, teams, "aoki", { text: "死ね", channelId: "study", kind: "report", scope: "everyone" }, db);
    expect(blocked.status).toBe(422);
    const caution = await handlePublish(scripted, teams, "aoki", { text: "あの先生は使えない", channelId: "study", kind: "report", scope: "everyone" }, db);
    const id = (caution.body as { postId: string }).postId;
    expect(teams.listPosts("saeki", "study").find((p) => p.id === id)?.needsLook).toBe(true);
    // 本人のポートフォリオには印が出ない
    db.prepare("UPDATE posts SET created_at = ? WHERE id = ?").run(NOW.toISOString(), id);
    const shown = view("aoki").candidates.find((c) => c.ref === id);
    expect(shown).toBeDefined();
    expect(Object.keys(shown ?? {}).sort()).toEqual(["date", "detail", "kind", "label", "ref", "shareable", "text"]);
  });
});

it("おかしな依頼は受け付けない", async () => {
  expect((await handlePortfolio(scripted, db, "saeki", null, options)).status).toBe(400);
  expect((await act("saeki", { action: "x" })).status).toBe(400);
  expect((await act("saeki", { action: "remove" })).status).toBe(400);
});
