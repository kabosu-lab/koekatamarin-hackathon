import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { chooseAvatar, countContributions, getAvatar } from "./avatar";
import { catalogEntry } from "./avatar-catalog";
import { catchUpAvatar, chooseEvolution, evolutionCandidates, handleEvolve, pendingEvolution } from "./avatar-evolve";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T03:00:00Z");
const scripted = createScriptedClaude();
let db: DatabaseSync;
let counter = 0;

function recording(answer: unknown): { client: ClaudeClient; requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = [];
  return {
    requests,
    client: {
      mode: "real",
      async complete(request) {
        requests.push(request);
        if (answer instanceof Error) throw answer;
        return { text: JSON.stringify(answer), refused: false };
      },
    },
  };
}

function thank(count: number, personId = PERSON) {
  const insert = db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, 'aoki', ?, 'ありがとう', ?)");
  for (let i = 0; i < count; i++) insert.run(`grow-${counter++}`, personId, NOW.toISOString());
}

const PERSON = "saeki";

/** ありがとうで、次の段階まで育てる。 */
function growToNext(personId: string) {
  const before = pendingEvolution(db, personId);
  expect(before).toBeNull();
  thank(30, personId);
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  db.prepare("DELETE FROM avatars WHERE person_id = ?").run(PERSON);
  chooseAvatar(db, PERSON, "creature", "listen");
});

describe("進化の選択", () => {
  it("育っても、選ぶまで今の姿のまま", () => {
    const before = getAvatar(db, PERSON);
    growToNext(PERSON);
    expect(pendingEvolution(db, PERSON)).not.toBeNull();
    expect(getAvatar(db, PERSON)).toEqual(before);
  });

  it("候補は2〜3個で、今の系統と違う方向を含み、選ぶと段階が上がる", async () => {
    const before = getAvatar(db, PERSON);
    growToNext(PERSON);
    const candidates = await evolutionCandidates(scripted, db, PERSON, NOW);
    expect(candidates?.length).toBeGreaterThanOrEqual(2);
    expect(candidates?.length).toBeLessThanOrEqual(3);
    expect(candidates?.map((c) => c.family)).toContain(before.family);
    const other = candidates?.find((c) => c.family !== before.family);
    const after = chooseEvolution(db, PERSON, other?.family);
    expect(after?.family).toBe(other?.family);
    expect(after?.stage).toBe(before.stage + 1);
  });

  it("人物の系統へも進めて、段階は下がらない", async () => {
    const before = getAvatar(db, PERSON);
    growToNext(PERSON);
    const human = (await evolutionCandidates(scripted, db, PERSON, NOW))?.find((c) => catalogEntry(c.family)?.group === "human");
    expect(human).toBeDefined();
    expect(chooseEvolution(db, PERSON, human?.family)?.stage).toBeGreaterThan(before.stage);
  });

  it("たくさん育っても一度に1段ずつで、次の段階でまた選べる", async () => {
    db.prepare("DELETE FROM avatars WHERE person_id = ?").run(PERSON);
    chooseAvatar(db, PERSON, "human", "listen");
    growToNext(PERSON);
    const first = pendingEvolution(db, PERSON) as number;
    const candidates = await evolutionCandidates(scripted, db, PERSON, NOW);
    chooseEvolution(db, PERSON, candidates?.[0].family);
    expect(pendingEvolution(db, PERSON)).toBe(first + 1);
  });

  it("候補にないものや、一覧にないものは選べず、姿は変わらない", async () => {
    const before = getAvatar(db, PERSON);
    growToNext(PERSON);
    expect(chooseEvolution(db, PERSON, "bird")).toBeNull();
    await evolutionCandidates(scripted, db, PERSON, NOW);
    expect(chooseEvolution(db, PERSON, "pikachu")).toBeNull();
    expect(getAvatar(db, PERSON)).toEqual(before);
    const refused = await handleEvolve(scripted, db, PERSON, { action: "choose", family: "pikachu" });
    expect(refused.status).toBe(400);
  });

  it("進化できないときは、候補を出さず Claude も呼ばない", async () => {
    const { client, requests } = recording({ candidates: [] });
    expect(await evolutionCandidates(client, db, PERSON, NOW)).toBeNull();
    expect((await handleEvolve(client, db, PERSON, { action: "candidates" })).status).toBe(409);
    expect(requests).toHaveLength(0);
  });

  it("台本では Claude を呼ばず、本物は段階ごとに1回だけ呼ぶ", async () => {
    growToNext(PERSON);
    const { client, requests } = recording({
      candidates: [
        { family: "cloud", reason: "ふんわり" },
        { family: "pikachu", reason: "一覧にない" },
        { family: "coat", reason: "静かに考える" },
      ],
    });
    const first = await evolutionCandidates(client, db, PERSON, NOW);
    await evolutionCandidates(client, db, PERSON, NOW);
    expect(requests).toHaveLength(1);
    expect(requests[0].task).toBe("avatar_evolve");
    expect(first?.map((c) => c.family)).not.toContain("pikachu");
    // 今の系統を必ず含める
    expect(first?.map((c) => c.family)).toContain("bird");
    expect(first?.find((c) => c.family === "cloud")?.reason).toBe("ふんわり");
  });

  it("Claude が失敗しても、コードの候補で進める", async () => {
    growToNext(PERSON);
    const candidates = await evolutionCandidates(recording(new Error("boom")).client, db, PERSON, NOW);
    expect(candidates?.length).toBeGreaterThanOrEqual(2);
    expect(chooseEvolution(db, PERSON, candidates?.[0].family)).not.toBeNull();
  });

  it("前からいる人は今の段階が起点で、いきなり選ばせない", () => {
    db.prepare("UPDATE avatars SET shown_stage = NULL WHERE person_id = ?").run(PERSON);
    thank(30);
    expect(pendingEvolution(db, PERSON)).toBeNull();
    thank(30);
    const row = db.prepare("SELECT shown_stage FROM avatars WHERE person_id = ?").get(PERSON) as { shown_stage: number };
    expect(row.shown_stage).toBeGreaterThan(0);
  });

  it("選ばなくても姿は減らず、順位や点数を返さない", async () => {
    growToNext(PERSON);
    const candidates = await evolutionCandidates(scripted, db, PERSON, NOW);
    expect(JSON.stringify(candidates)).not.toMatch(/rank|score|順位|点/);
    const after = chooseEvolution(db, PERSON, candidates?.[0].family);
    db.prepare("DELETE FROM thanks WHERE to_person_id = ?").run(PERSON);
    expect(getAvatar(db, PERSON).stage).toBe(after?.stage);
  });
});

describe("裏で育つ", () => {
  it("隠している間もやり取りが数えられ、切り替えると育った姿で出る", () => {
    const before = getAvatar(db, PERSON);
    const count = countContributions(db, PERSON).thanksReceived;
    growToNext(PERSON);
    expect(countContributions(db, PERSON).thanksReceived).toBeGreaterThan(count);
    catchUpAvatar(db, PERSON);
    const after = getAvatar(db, PERSON);
    expect(after.stage).toBeGreaterThan(before.stage);
    expect(after.family).toBe(before.family);
    expect(pendingEvolution(db, PERSON)).toBeNull();
  });

  it("分身がない人では何も起きない", () => {
    db.prepare("DELETE FROM avatars WHERE person_id = ?").run(PERSON);
    expect(() => catchUpAvatar(db, PERSON)).not.toThrow();
    expect(getAvatar(db, PERSON).family).toBeNull();
  });
});
