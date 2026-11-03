import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import {
  confirmKnowledge,
  draftKnowledge,
  findKnowledge,
  getKnowledge,
  handleKnowledgeCreate,
  handleKnowledgeEdit,
  handleKnowledgeFind,
  handleKnowledgeReview,
  isMajorEdit,
  listKnowledgeTasks,
  listSharedKnowledge,
  loadMaterial,
  removeFromKnowledge,
  resolveKnowledgeReview,
  withdrawKnowledge,
} from "./knowledge";
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
  it("貢献者は評価できず、直す指摘は言葉が必須で、同じ人は上書き", async () => {
    const seedId = "knowledge-quick-quiz";
    expect((await handleKnowledgeReview(scripted, db, "ogawara", { itemId: seedId, verdict: "helped" }, NOW)).status).toBe(403);
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "fix", comment: " " }, NOW)).status).toBe(400);
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "helped" }, NOW)).status).toBe(200);
    expect(getKnowledge(db, "saeki", seedId)?.helpedCount).toBe(1);
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "fix", comment: "英語でも試したい" }, NOW);
    const detail = getKnowledge(db, "saeki", seedId);
    expect([detail?.helpedCount, detail?.openFixCount, detail?.reviews.length]).toEqual([0, 1, 1]);
  });

  it("確認中の知恵は評価できず、指摘を解決できるのは作った人だけ", async () => {
    const id = await create();
    expect((await handleKnowledgeReview(scripted, db, "saeki", { itemId: id, verdict: "helped" }, NOW)).status).toBe(404);
    const seedId = "knowledge-quick-quiz";
    await handleKnowledgeReview(scripted, db, "saeki", { itemId: seedId, verdict: "fix", comment: "英語でも試したい" }, NOW);
    const reviewId = getKnowledge(db, "saeki", seedId)!.reviews[0].id;
    expect(resolveKnowledgeReview(db, "saeki", seedId, reviewId, NOW)).toBe(false);
    expect(resolveKnowledgeReview(db, "kawamura", seedId, reviewId, NOW)).toBe(true);
    expect(getKnowledge(db, "saeki", seedId)?.openFixCount).toBe(0);
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

describe("最初のデータ", () => {
  it("前からある DB にも1度だけ入り、取り下げたものを戻さない", () => {
    expect(listSharedKnowledge(db, "fujimoto").length).toBe(2);
    withdrawKnowledge(db, "knowledge-quick-quiz", "kawamura", NOW);
    seedDatabase(db);
    expect(listSharedKnowledge(db, "fujimoto").map((i) => i.id)).toEqual(["knowledge-festival-video"]);
  });
});
