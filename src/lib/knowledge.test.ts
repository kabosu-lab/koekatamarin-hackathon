import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import {
  confirmKnowledge,
  deleteKnowledgeNote,
  draftKnowledge,
  findKnowledge,
  getKnowledge,
  handleKnowledgeCreate,
  handleKnowledgeEdit,
  handleKnowledgeFind,
  handleKnowledgeNote,
  handleKnowledgeReview,
  isMajorEdit,
  listKnowledgeTasks,
  listSharedKnowledge,
  loadMaterial,
  removeFromKnowledge,
  removeKnowledgeLike,
  resolveKnowledgeReview,
  voteKnowledgeNote,
  withdrawKnowledge,
} from "./knowledge";
import { handleMemory } from "./memory";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T01:00:00Z");
const scripted = createScriptedClaude();
const BODY = "過去問はネットワークから解くと順調（野田先生）。";
let db: DatabaseSync;
let teams: PostDestination;

function recording(answer: unknown): { client: ClaudeClient; requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = [];
  return {
    requests,
    client: {
      mode: "real",
      async complete(request) {
        requests.push(request);
        return { text: JSON.stringify(answer), refused: false };
      },
    },
  };
}

/** 青木さんの投稿に野田先生が返したやり取りから、青木さんが知恵を作る */
async function create(author = "aoki", postId = "post-study-1", body = BODY): Promise<string> {
  const { status, body: result } = await handleKnowledgeCreate(scripted, db, teams, author, { postId, title: "過去問の進め方", body }, NOW);
  expect(status).toBe(200);
  return result.itemId as string;
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

describe("材料", () => {
  it("範囲を絞った投稿は材料にならない", () => {
    const postId = teams.createPost("aoki", "study", "自分だけのメモ", { scope: "self" });
    db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES ('r', ?, 'noda', '返事', ?)").run(postId, NOW.toISOString());
    expect(loadMaterial(db, teams, "aoki", postId)).toBeNull();
  });

  it("忘れた言葉は材料に入らず、貢献者にもならない", async () => {
    db.prepare("INSERT INTO forgotten_words (person_id, source_id) VALUES ('kinoshita', 'reply-making-2b')").run();
    db.exec("DELETE FROM knowledge_items WHERE source_post_id = 'post-making-2'");
    const material = loadMaterial(db, teams, "kawamura", "post-making-2");
    expect(material?.replies.map((r) => r.id)).toEqual(["reply-making-2a"]);
    expect(material?.contributorIds).toEqual(["kawamura", "noda"]);
    const { client, requests } = recording({ ready: true, title: "題", body: "本文" });
    await draftKnowledge(client, material!);
    expect(requests[0].messages[0].content).not.toContain("音楽は最後に");
  });

  it("教職員だけのチャネルと、関わっていない人からは残せない", () => {
    expect(loadMaterial(db, teams, "saeki", "post-staff-1")).toBeNull();
    expect(loadMaterial(db, teams, "kinoshita", "post-study-1")).toBeNull();
  });
});

describe("確認", () => {
  it("貢献者は Claude ではなく、実際の投稿者と返信者からコードで決まる", async () => {
    const id = await create();
    const detail = getKnowledge(db, "aoki", id);
    expect(detail?.contributors.map((c) => [c.id, c.state])).toEqual([["noda", "waiting"], ["aoki", "ok"]]);
  });

  it("全員が ok になるまで広がらず、確認中は関わる人にしか見えず、検索にも出ない", async () => {
    const id = await create();
    expect(getKnowledge(db, "fujimoto", id)).toBeNull();
    expect(listSharedKnowledge(db, "fujimoto").map((i) => i.id)).not.toContain(id);
    const { client, requests } = recording({ results: [] });
    await handleKnowledgeFind(client, db, teams, "fujimoto", { query: "過去問" });
    expect(requests[0].messages[0].content).not.toContain("k-" + id);

    expect(listKnowledgeTasks(db, "noda").map((t) => t.id)).toContain(id);
    expect(confirmKnowledge(db, id, "noda", NOW)).toBe(true);
    expect(getKnowledge(db, "fujimoto", id)?.status).toBe("shared");
    expect(listKnowledgeTasks(db, "noda").map((t) => t.id)).not.toContain(id);
  });

  it("外すと広がらず、作った人が直して確認をやり直すまで戻らない", async () => {
    const id = await create();
    confirmKnowledge(db, id, "noda", NOW);
    expect(removeFromKnowledge(db, id, "noda", NOW)).toBe(true);
    expect(getKnowledge(db, "fujimoto", id)).toBeNull();
    expect(listKnowledgeTasks(db, "aoki")).toContainEqual({ id, title: "過去問の進め方", reason: "fix" });

    const same = await handleKnowledgeEdit(scripted, db, "aoki", { itemId: id, title: "過去問の進め方", body: BODY }, NOW);
    expect(same.status).toBe(400);
    const edited = await handleKnowledgeEdit(scripted, db, "aoki", { itemId: id, title: "過去問の進め方", body: "過去問は毎日解く。" }, NOW);
    expect(edited.status).toBe(200);
    const detail = getKnowledge(db, "fujimoto", id);
    expect(detail?.status).toBe("shared");
    expect(detail?.people.map((p) => p.id)).toEqual(["aoki"]);
  });

  it("他人の知恵は直せず、取り下げもできない", async () => {
    const id = await create();
    const { status } = await handleKnowledgeEdit(scripted, db, "noda", { itemId: id, title: "乗っ取り", body: "乗っ取り" }, NOW);
    expect(status).toBe(404);
    expect(withdrawKnowledge(db, id, "noda", NOW)).toBe(false);
    expect(getKnowledge(db, "aoki", id)?.title).toBe("過去問の進め方");
    expect(withdrawKnowledge(db, id, "aoki", NOW)).toBe(true);
    expect(getKnowledge(db, "noda", id)).toBeNull();
  });

  it("誤字の直しは確認に戻さず、大きな直しは戻す", async () => {
    expect(isMajorEdit(BODY, BODY.replace("順調", "順長"))).toBe(false);
    expect(isMajorEdit(BODY, "まったく別の、新しい話に書き換えた本文です。")).toBe(true);
    const id = await create();
    confirmKnowledge(db, id, "noda", NOW);
    await handleKnowledgeEdit(scripted, db, "aoki", { itemId: id, title: "過去問の進め方", body: "まったく別の、新しい話に書き換えた本文です。" }, NOW);
    expect(getKnowledge(db, "aoki", id)?.status).toBe("confirming");
    expect(getKnowledge(db, "aoki", id)?.contributors.find((c) => c.id === "noda")?.state).toBe("waiting");
  });
});

describe("レビュー", () => {
  it("貢献者は反応できず、「うまくいかなかった」は理由が必須で、同じ人は上書き", async () => {
    const seedId = "knowledge-quick-quiz";
    expect((await handleKnowledgeReview(scripted, db, "ogawara", { itemId: seedId, verdict: "like" }, NOW)).status).toBe(403);
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "not_working", comment: " " }, NOW)).status).toBe(400);
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "like" }, NOW)).status).toBe(200);
    expect(getKnowledge(db, "saeki", seedId)?.likeCount).toBe(1);
    expect(getKnowledge(db, "saeki", seedId)?.likedByViewer).toBe(true);
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "not_working", comment: "英語でも試したい" }, NOW);
    const detail = getKnowledge(db, "saeki", seedId);
    expect([detail?.likeCount, detail?.reviews.length]).toEqual([0, 1]);
  });

  it("いいねは取り消せて、「うまくいかなかった」は取り消しで消えない", async () => {
    const seedId = "knowledge-quick-quiz";
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "like" }, NOW);
    expect(removeKnowledgeLike(db, "saeki", seedId)).toBe(true);
    expect(getKnowledge(db, "saeki", seedId)?.likeCount).toBe(0);
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "not_working", comment: "英語では難しかった" }, NOW);
    expect(removeKnowledgeLike(db, "saeki", seedId)).toBe(false);
    expect(getKnowledge(db, "aoki", seedId)?.reviews.map((r) => r.comment)).toEqual(["英語では難しかった"]);
  });

  it("「うまくいかなかった」の数は、一覧にも詳しい内容にも入らない", async () => {
    const seedId = "knowledge-quick-quiz";
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "not_working", comment: "英語では難しかった" }, NOW);
    const summary = listSharedKnowledge(db, "aoki").find((item) => item.id === seedId);
    const detail = getKnowledge(db, "aoki", seedId);
    for (const shape of [summary, detail]) {
      const keys = Object.keys(shape ?? {}).join(",");
      expect(keys).not.toMatch(/fixCount|notWorking|openFix/i);
    }
    expect(summary).not.toHaveProperty("reviews");
  });

  it("いいねに言葉は残らない", async () => {
    const seedId = "knowledge-quick-quiz";
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "like", comment: "好きな言葉" }, NOW);
    expect(getKnowledge(db, "aoki", seedId)?.reviews).toEqual([]);
  });

  it("強い言い方の「うまくいかなかった」は保存しない", async () => {
    const blocking = recording({ verdict: "block", perception: "強い言葉です", alternatives: [] });
    const outcome = await handleKnowledgeReview(blocking.client, db, "saeki", { itemId: "knowledge-quick-quiz", verdict: "not_working", comment: "ひどい" }, NOW);
    expect(outcome.status).toBe(422);
    expect(getKnowledge(db, "aoki", "knowledge-quick-quiz")?.reviews).toEqual([]);
  });

  it("確認中の知恵は評価できず、指摘を解決できるのは作った人だけ", async () => {
    const id = await create();
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: id, verdict: "like" }, NOW)).status).toBe(404);
    const seedId = "knowledge-quick-quiz";
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "not_working", comment: "英語でも試したい" }, NOW);
    const reviewId = getKnowledge(db, "saeki", seedId)!.reviews[0].id;
    expect(resolveKnowledgeReview(db, "saeki", seedId, reviewId, NOW)).toBe(false);
    expect(resolveKnowledgeReview(db, "kawamura", seedId, reviewId, NOW)).toBe(true);
    expect(getKnowledge(db, "saeki", seedId)?.reviews[0].resolved).toBe(true);
  });
});

describe("探す", () => {
  it("存在しない ID は捨て、本文は Claude の言葉ではなく DB の実物を使う", async () => {
    const { client } = recording({
      results: [
        { id: "k-knowledge-quick-quiz", reason: "小テストの話です" },
        { id: "k-存在しない", reason: "作り話" },
      ],
    });
    const { body } = await handleKnowledgeFind(client, db, teams, "fujimoto", { query: "小テスト" });
    const results = body.results as { key: string; body: string; people: { id: string }[]; reason: string }[];
    expect(results.map((r) => r.key)).toEqual(["k-knowledge-quick-quiz"]);
    expect(results[0].body).toContain("同じ形の問題を5問");
    expect(results[0].people.map((p) => p.id)).toContain("ogawara");
  });

  it("候補の一覧に材料の ID だけを渡す", async () => {
    const { client, requests } = recording({ results: [] });
    await findKnowledge(client, "話", [{ id: "k-a", text: "本文" }]);
    const schema = requests[0].jsonSchema as { properties: { results: { items: { properties: { id: { enum: string[] } } } } } };
    expect(schema.properties.results.items.properties.id.enum).toEqual(["k-a"]);
  });

  it("範囲を絞った投稿、お知らせ、教職員のチャネルは材料に入らない", async () => {
    teams.createPost("noda", "study", "秘密の投稿です", { scope: "self" });
    const { client, requests } = recording({ results: [] });
    await handleKnowledgeFind(client, db, teams, "saeki", { query: "話" });
    const prompt = requests[0].messages[0].content;
    expect(prompt).not.toContain("秘密の投稿です");
    expect(prompt).not.toContain("post-notice-1");
    expect(prompt).not.toContain("post-staff-1");
  });

  it("しばらく出さない人の知恵と投稿は出さない", async () => {
    db.prepare("INSERT INTO hidden_people (person_id, hidden_person_id, created_at) VALUES ('fujimoto', 'ogawara', ?)").run(NOW.toISOString());
    expect(listSharedKnowledge(db, "fujimoto").map((i) => i.id)).not.toContain("knowledge-quick-quiz");
  });

  it("話した言葉を保存しない", async () => {
    const before = db.prepare("SELECT count(*) AS n FROM companion_memories").get() as { n: number };
    await handleKnowledgeFind(scripted, db, teams, "fujimoto", { query: "文化祭の動画" });
    expect(db.prepare("SELECT count(*) AS n FROM companion_memories").get()).toEqual(before);
  });

  it("台本でも近いものが選ばれる", async () => {
    const { body } = await handleKnowledgeFind(scripted, db, teams, "fujimoto", { query: "文化祭の動画を作りたい" });
    expect((body.results as { key: string }[]).map((r) => r.key)).toContain("k-knowledge-festival-video");
  });
});

describe("注釈", () => {
  const seedId = "knowledge-quick-quiz";
  async function addNote(person = "kinoshita", body = "テストの前の週は、問題を3問に減らしています") {
    const outcome = await handleKnowledgeNote(scripted, db, person, { itemId: seedId, body }, NOW);
    expect(outcome.status).toBe(200);
    return getKnowledge(db, person, seedId)!.notes.find((note) => note.body === body)!;
  }
  const noteFor = (viewer: string, id: string) => getKnowledge(db, viewer, seedId)!.notes.find((note) => note.id === id);

  it("書いた人以外の2人で出て、取り消すと戻る。押した人数は返さない", async () => {
    const note = await addNote();
    expect(note.shown).toBe(false);
    expect(Object.keys(note)).not.toContain("votes");
    expect(voteKnowledgeNote(db, "saeki", seedId, note.id, true)).toBe(true);
    expect(noteFor("aoki", note.id)?.shown).toBe(false);
    expect(voteKnowledgeNote(db, "noda", seedId, note.id, true)).toBe(true);
    expect(noteFor("aoki", note.id)?.shown).toBe(true);
    expect(listSharedKnowledge(db, "aoki").find((item) => item.id === seedId)?.shownNotes.map((n) => n.id)).toContain(note.id);
    expect(voteKnowledgeNote(db, "noda", seedId, note.id, false)).toBe(true);
    expect(noteFor("aoki", note.id)?.shown).toBe(false);
  });

  it("同じ人が何度押しても1人で、自分の注釈には押せない", async () => {
    const note = await addNote();
    expect(voteKnowledgeNote(db, "kinoshita", seedId, note.id, true)).toBe(false);
    voteKnowledgeNote(db, "saeki", seedId, note.id, true);
    voteKnowledgeNote(db, "saeki", seedId, note.id, true);
    expect(noteFor("aoki", note.id)?.shown).toBe(false);
  });

  it("書いた本人だけが消せる", async () => {
    const note = await addNote();
    expect(deleteKnowledgeNote(db, "aoki", seedId, note.id)).toBe(false);
    expect(deleteKnowledgeNote(db, "kinoshita", seedId, note.id)).toBe(true);
    expect(noteFor("aoki", note.id)).toBeUndefined();
  });

  it("確認中の知恵には付けられず、範囲外の人には見えない", async () => {
    const id = await create();
    expect((await handleKnowledgeNote(scripted, db, "aoki", { itemId: id, body: "補足" }, NOW)).status).toBe(404);
    const note = await addNote();
    voteKnowledgeNote(db, "saeki", seedId, note.id, true);
    voteKnowledgeNote(db, "noda", seedId, note.id, true);
    forgetForNote();
    expect(getKnowledge(db, "aoki", seedId)).toBeNull();
    expect(voteKnowledgeNote(db, "aoki", seedId, note.id, true)).toBe(false);
    expect(listSharedKnowledge(db, "aoki").map((item) => item.id)).not.toContain(seedId);
  });

  it("強い言い方の注釈は保存せず、確かめられなければ保存しない", async () => {
    const blocking = recording({ verdict: "block", perception: "強い言葉です", alternatives: [] });
    expect((await handleKnowledgeNote(blocking.client, db, "kinoshita", { itemId: seedId, body: "ひどい" }, NOW)).status).toBe(422);
    const broken: ClaudeClient = {
      mode: "real",
      async complete() {
        throw new Error("つながらない");
      },
    };
    expect((await handleKnowledgeNote(broken, db, "kinoshita", { itemId: seedId, body: "補足" }, NOW)).status).toBe(503);
    expect(getKnowledge(db, "kinoshita", seedId)?.notes.map((note) => note.body)).not.toContain("補足");
  });

  it("最初の注釈は、2人が押した状態で知恵の下に出る", () => {
    expect(getKnowledge(db, "aoki", seedId)?.shownNotes.map((note) => note.id)).toEqual(["note-quick-quiz"]);
  });

  function forgetForNote() {
    handleMemory(db, "ogawara", { action: "forget", kind: "published", id: "reply-study-2" }, NOW);
  }
});

describe("最初のデータ", () => {
  it("前からある DB にも1度だけ入り、取り下げたものを戻さない", () => {
    expect(listSharedKnowledge(db, "fujimoto").length).toBe(4);
    withdrawKnowledge(db, "knowledge-quick-quiz", "kawamura", NOW);
    seedDatabase(db);
    expect(listSharedKnowledge(db, "fujimoto").map((i) => i.id)).not.toContain("knowledge-quick-quiz");
  });
});

describe("「忘れて」と知恵", () => {
  const forget = (personId: string, id: string) => handleMemory(db, personId, { action: "forget", kind: "published", id }, NOW);

  it("返した人が「忘れて」と言うと、広がらなくなり、名前も外れ、作った人に直しを頼む", () => {
    forget("kinoshita", "reply-making-2b");
    expect(listSharedKnowledge(db, "aoki").map((item) => item.id)).not.toContain("knowledge-festival-video");
    const item = getKnowledge(db, "kawamura", "knowledge-festival-video");
    expect(item?.fixRequested).toBe(true);
    expect(item?.contributors.find((c) => c.id === "kinoshita")?.state).toBe("removed");
    expect(listKnowledgeTasks(db, "kawamura")).toContainEqual({ id: "knowledge-festival-video", title: item?.title, reason: "fix" });
  });

  it("作った人が自分の投稿を「忘れて」と言っても、直すまで広がらない", () => {
    forget("kawamura", "post-making-2");
    expect(listSharedKnowledge(db, "aoki").map((item) => item.id)).not.toContain("knowledge-festival-video");
    expect(getKnowledge(db, "kawamura", "knowledge-festival-video")?.fixRequested).toBe(true);
  });

  it("他の人の言葉を「忘れて」と言っても、知恵は動かない", () => {
    forget("aoki", "reply-making-2b");
    expect(listSharedKnowledge(db, "saeki").map((item) => item.id)).toContain("knowledge-festival-video");
  });
});

describe("「聞いてみる？」の相手", () => {
  it("知恵では、質問した本人を外し、答えた人にする", () => {
    const item = getKnowledge(db, "aoki", "knowledge-festival-video");
    expect(item?.people.map((person) => person.id)).toContain("kawamura");
    expect(item?.askableIds).not.toContain("kawamura");
    expect(item?.askableIds).toEqual(expect.arrayContaining(["noda", "kinoshita"]));
  });

  it("投稿の検索でも、困りごとの本人は外し、頑張りの本人は残す", async () => {
    const outcome = await handleKnowledgeFind(
      recording({ results: [{ id: "p-post-study-2", reason: "近い" }, { id: "p-post-clubs-1", reason: "近い" }] }).client,
      db,
      teams,
      "aoki",
      { query: "小テスト" },
    );
    const results = (outcome.body as { results: { key: string; askable: { id: string }[] }[] }).results;
    const ids = (key: string) => results.find((result) => result.key === key)?.askable.map((person) => person.id);
    if (ids("p-post-study-2")) expect(ids("p-post-study-2")).not.toContain("kawamura");
    expect(ids("p-post-clubs-1")).toEqual(["nakamura"]);
  });
});
