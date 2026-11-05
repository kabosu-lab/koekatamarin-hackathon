import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { handlePublish } from "./compose-request";
import {
  addGoal,
  getGoal,
  getNudge,
  goalPromptText,
  goalQuestion,
  goalsForPrompt,
  handleGoalCheck,
  handleGoals,
  listCelebratedPostIds,
  listGoals,
  markCelebrated,
} from "./goals";
import { seedDatabase } from "./seed";
import { handleTalk } from "./talk-request";
import { listTodayCards } from "./today";

const NOW = new Date("2026-11-04T01:00:00Z"); // 水曜の朝
const NIGHT = new Date("2026-11-04T14:00:00Z");
const scripted = createScriptedClaude();
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

const talk = (text: string) => [{ role: "user", content: text }];

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

describe("決めるのは本人", () => {
  it("パートナーの提案だけでは残らない", async () => {
    const { client } = recording({ goal: "毎日歩く", doneGoalId: "" });
    const outcome = await handleGoalCheck(client, db, "saeki", { history: talk("毎日歩きたいな") });
    expect(outcome.body).toEqual({ suggestion: "毎日歩く", done: null });
    expect(listGoals(db, "saeki")).toEqual([]);
  });

  it("関係のない言葉では Claude を呼ばない", async () => {
    const { client, requests } = recording({ goal: "x", doneGoalId: "" });
    await handleGoalCheck(client, db, "saeki", { history: talk("こんにちは") });
    expect(requests).toHaveLength(0);
  });

  it("候補にない ID は「できた」にしない。「できた」でも本人が押すまで変わらない", async () => {
    const goal = addGoal(db, "saeki", "歩く", NOW);
    const bad = await handleGoalCheck(recording({ goal: "", doneGoalId: "other" }).client, db, "saeki", { history: talk("歩けた、できた") });
    expect(bad.body).toEqual({ suggestion: null, done: null });
    const good = await handleGoalCheck(recording({ goal: "", doneGoalId: goal?.id }).client, db, "saeki", { history: talk("歩けた、できた") });
    expect(good.body).toEqual({ suggestion: null, done: { id: goal?.id, text: "歩く" } });
    expect(getGoal(db, "saeki", goal?.id as string)?.status).toBe("active");
  });

  it("Claude が失敗しても、話を止めない", async () => {
    const client: ClaudeClient = {
      mode: "real",
      async complete() {
        throw new Error("x");
      },
    };
    const outcome = await handleGoalCheck(client, db, "saeki", { history: talk("歩きたい") });
    expect(outcome).toEqual({ status: 200, body: { suggestion: null, done: null } });
  });
});

describe("本人だけのもの", () => {
  it("他の人の一覧に出ず、他の人は直せず消せない", () => {
    const goal = addGoal(db, "saeki", "秘密の頑張り", NOW);
    expect(listGoals(db, "noda")).toEqual([]);
    expect(goalsForPrompt(db, "noda")).toBe("");
    for (const action of [
      { action: "edit", id: goal?.id, text: "書き換え" },
      { action: "delete", id: goal?.id },
      { action: "done", id: goal?.id },
    ]) {
      expect(handleGoals(db, "noda", action, NOW).status).toBe(404);
    }
    expect(getGoal(db, "saeki", goal?.id as string)?.text).toBe("秘密の頑張り");
    expect(getGoal(db, "noda", goal?.id as string)).toBeNull();
  });

  it("直せて、消せる", () => {
    const goal = addGoal(db, "saeki", "歩く", NOW);
    handleGoals(db, "saeki", { action: "edit", id: goal?.id, text: "毎日歩く" }, NOW);
    expect(listGoals(db, "saeki")[0].text).toBe("毎日歩く");
    handleGoals(db, "saeki", { action: "delete", id: goal?.id }, NOW);
    expect(listGoals(db, "saeki")).toEqual([]);
  });

  it("空や長すぎる言葉は残さず、タグの記号も残さない", () => {
    expect(addGoal(db, "saeki", " ", NOW)).toBeNull();
    expect(addGoal(db, "saeki", "あ".repeat(61), NOW)).toBeNull();
    expect(addGoal(db, "saeki", "<b>歩く</b>", NOW)?.text).toBe("b歩く/b");
  });
});

describe("促し方", () => {
  it("本人が選び、指示に入る。初めはそっと", () => {
    expect(getNudge(db, "saeki")).toBe("gentle");
    addGoal(db, "saeki", "動画を見る", NOW);
    expect(goalsForPrompt(db, "saeki")).toContain("そっと");
    expect(goalsForPrompt(db, "saeki")).toContain("<頑張りたいこと>動画を見る</頑張りたいこと>");
    handleGoals(db, "saeki", { action: "nudge", nudge: "blunt" }, NOW);
    expect(goalsForPrompt(db, "saeki")).toContain("耳が痛め");
    expect(handleGoals(db, "saeki", { action: "nudge", nudge: "怖く" }, NOW).status).toBe(400);
  });

  it("責めないこと、しんどいときは促さないことを指示する", () => {
    const text = goalPromptText(["歩く"], "blunt");
    expect(text).toContain("促さない");
    expect(text).toContain("人を評価する言葉");
    expect(text).toContain("褒めるのは周りの人");
  });

  it("パートナーへの話しかけのときに指示として渡り、できたものは渡らない", async () => {
    const goal = addGoal(db, "saeki", "動画を見る", NOW);
    addGoal(db, "saeki", "歩く", NOW);
    handleGoals(db, "saeki", { action: "done", id: goal?.id }, NOW);
    const { client, requests } = recording({ category: "none" });
    await handleTalk(client, db, "saeki", { history: [], text: "こんにちは" }, NOW);
    const system = requests.find((request) => request.task === "converse")?.system ?? "";
    expect(system).toContain("<頑張りたいこと>歩く</頑張りたいこと>");
    expect(system).not.toContain("動画を見る</頑張りたいこと>");
  });

  it("開いたときの問いかけは促し方に合い、夜には出ない", () => {
    expect(goalQuestion(db, "saeki", NOW)).toBeNull();
    addGoal(db, "saeki", "歩く", NOW);
    expect(goalQuestion(db, "saeki", NOW)).toContain("どんな感じ");
    handleGoals(db, "saeki", { action: "nudge", nudge: "blunt" }, NOW);
    expect(goalQuestion(db, "saeki", NOW)).toContain("どうなった");
    expect(goalQuestion(db, "saeki", NIGHT)).toBeNull();
  });
});

describe("乗り越えた投稿", () => {
  async function publish(person: string, goalId: string | undefined, scope = "everyone") {
    const outcome = await handlePublish(scripted, teams, person, { text: "動画を全部見ました", channelId: "study", kind: "effort", scope, goalId, scopePersonId: undefined }, db);
    return (outcome.body as { postId: string }).postId;
  }

  it("印の投稿は、最初の3人のすぐあとまでに出る", async () => {
    const goal = addGoal(db, "aoki", "動画を見る", NOW);
    handleGoals(db, "aoki", { action: "done", id: goal?.id }, NOW);
    const postId = await publish("aoki", goal?.id);
    const cards = listTodayCards(teams, "noda", NOW, new Set(), [], listCelebratedPostIds(db, NOW));
    const at = cards.findIndex((card) => card.postId === postId);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(3);
    expect(cards[at].relatedReason).toContain("できた");
  });

  it("範囲を絞った投稿は、印があっても出ない", async () => {
    const goal = addGoal(db, "aoki", "動画を見る", NOW);
    handleGoals(db, "aoki", { action: "done", id: goal?.id }, NOW);
    const postId = await publish("aoki", goal?.id, "self");
    const celebrated = listCelebratedPostIds(db, NOW);
    expect(celebrated.has(postId)).toBe(true);
    expect(listTodayCards(teams, "noda", NOW, new Set(), [], celebrated).map((c) => c.postId)).not.toContain(postId);
  });

  it("他の人の頑張りたいことや、まだできていないものでは印を付けない", async () => {
    const goal = addGoal(db, "aoki", "動画を見る", NOW);
    expect(markCelebrated(db, "aoki", goal?.id, "post-study-1", NOW)).toBe(false);
    handleGoals(db, "aoki", { action: "done", id: goal?.id }, NOW);
    expect(markCelebrated(db, "noda", goal?.id, "post-study-1", NOW)).toBe(false);
    expect(listCelebratedPostIds(db, NOW).size).toBe(0);
  });

  it("印は期間を過ぎると消え、できなかったことで減るものはない", () => {
    const goal = addGoal(db, "aoki", "動画を見る", NOW);
    handleGoals(db, "aoki", { action: "done", id: goal?.id }, NOW);
    markCelebrated(db, "aoki", goal?.id, "post-study-1", NOW);
    expect(listCelebratedPostIds(db, new Date("2026-12-01T00:00:00Z")).size).toBe(0);
    handleGoals(db, "aoki", { action: "reopen", id: goal?.id }, NOW);
    expect(listGoals(db, "aoki")[0].status).toBe("active");
  });
});

describe("台本モード", () => {
  it("台本でも提案と「できた」を返す", async () => {
    const goal = addGoal(db, "saeki", "歩く", NOW);
    const wish = await handleGoalCheck(scripted, db, "saeki", { history: talk("資格を取りたい") });
    expect((wish.body as { suggestion: string }).suggestion).toContain("資格");
    const done = await handleGoalCheck(scripted, db, "saeki", { history: talk("今日は歩いた") });
    expect((done.body as { done: { id: string } }).done.id).toBe(goal?.id);
  });
});
