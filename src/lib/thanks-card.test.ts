import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import { type DraftStreamEvent, handlePublish, handleUndo, prepareDraftStream } from "./compose-request";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { resetTeamsBridge, sendPostToTeams } from "./destination/teams-bridge";
import type { PostDestination } from "./destination/types";
import { countContributions } from "./avatar";
import { listInbox, listPassCandidates } from "./inbox";
import { seedDatabase } from "./seed";
import { listThanks } from "./thanks";
import { detectThanksCard } from "./thanks-people";

// 0-3d：サンクスカードは、ふつうの投稿の1つの種類（札で見分ける）

const scripted = createScriptedClaude();
let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

async function collect(words: string) {
  const prepared = prepareDraftStream(scripted, teams, "aoki", { history: [{ role: "user", content: words }] }, db);
  if (prepared.status !== 200) throw new Error("止まった");
  const events: DraftStreamEvent[] = [];
  await prepared.run((event) => events.push(event));
  return events;
}

describe("Claude が「まだ投稿にできない」と返しても、カードは決まった形で開く", () => {
  it("相手の分かっているカードは、ready が false でも下書きになる", async () => {
    const notReady = { mode: "real" as const, complete: async (request: { task: string }) =>
      request.task === "review"
        ? { text: JSON.stringify({ tone: "ok", note: "" }), refused: false }
        : { text: JSON.stringify({ ready: false, channelId: "thanks", kind: "report", researchedWithAi: false, announcement: false, subject: "", text: "" }), refused: false } };
    const prepared = prepareDraftStream(notReady as never, teams, "aoki", { history: [{ role: "user", content: "野田 翔さんにありがとうを伝えたい" }] }, db);
    if (prepared.status !== 200) throw new Error("止まった");
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => events.push(event));
    const draft = events.find((event) => event.type === "draft");
    expect(draft && draft.type === "draft" && draft.draft.ready).toBe(true);
    expect(draft && draft.type === "draft" && draft.draft.subject).toMatch(/^【ありがとう】野田 翔さんへ/);
    expect(draft && draft.type === "draft" && draft.draft.text).toContain("野田 翔さん、");
  });
});

describe("話した言葉からカードと見分ける", () => {
  it("特定の人へのお礼・お祝いはカード、名前が出るだけの話はカードにしない", () => {
    expect(detectThanksCard(db, "aoki", "野田先生にありがとうって伝えたい")?.to.id).toBe("noda");
    expect(detectThanksCard(db, "aoki", "佐伯先生、県大会おめでとうございます")?.kind).toBe("congrats");
    expect(detectThanksCard(db, "aoki", "野田先生に相談したいことがある")).toBeNull();
    expect(detectThanksCard(db, "aoki", "みんなありがとう")).toBeNull();
    // 「助かった」だけは相談にも出るので、カードにしない
    expect(detectThanksCard(db, "aoki", "野田先生に聞けたら助かったのに")).toBeNull();
  });

  it("名だけで当たったときは、後ろに敬称か「に・へ」があるときだけ", () => {
    expect(detectThanksCard(db, "aoki", "みどりの葉っぱがきれいで、ありがとうって思った")).toBeNull();
    expect(detectThanksCard(db, "aoki", "みどりさん、ありがとう")?.to.id).toBe("saeki");
    expect(detectThanksCard(db, "aoki", "みどり先生にありがとうって伝えたい")?.to.id).toBe("saeki");
  });

  it("何往復かしても、前の言葉にお礼と名前があればカードのまま", async () => {
    const prepared = prepareDraftStream(
      scripted,
      teams,
      "aoki",
      {
        history: [
          { role: "user", content: "野田先生にありがとうって伝えたい" },
          { role: "assistant", content: "いいね。どんなことで？" },
          { role: "user", content: "3D プリンターのこと" },
        ],
      },
      db,
    );
    if (prepared.status !== 200) throw new Error("止まった");
    const events: DraftStreamEvent[] = [];
    await prepared.run((event) => events.push(event));
    const start = events.find((event) => event.type === "start");
    expect(start?.type === "start" && start.asked?.id).toBe("noda");
  });

  it("台本でも、カードの下書きは宛名つきで、札がカードの札になり、ありがとうのチャネルへ", async () => {
    const events = await collect("野田先生にありがとうって伝えたい");
    const start = events.find((event) => event.type === "start");
    expect(start?.type === "start" && start.asked).toEqual({ id: "noda", name: "野田 翔", card: true });
    const draft = events.find((event) => event.type === "draft");
    expect(draft?.type === "draft" && draft.draft).toMatchObject({ ready: true, channelId: "thanks", subject: "【ありがとう】野田 翔さんへ" });
    // 送り先の札には「ありがとう」も並ぶ（ふつうの投稿に戻したら選び直せる）
    expect(start?.type === "start" && start.channels.some((c) => c.id === "study")).toBe(true);
  });

  it("おめでとうの話は【おめでとう】になる", async () => {
    const events = await collect("佐伯先生に県大会優勝おめでとうって言いたい");
    const draft = events.find((event) => event.type === "draft");
    expect(draft?.type === "draft" && draft.draft.subject).toBe("【おめでとう】佐伯 みどりさんへ");
  });

  it("ふつうの話は、ありがとうのチャネルを選ばない", async () => {
    const events = await collect("過去問を20問解いた");
    const draft = events.find((event) => event.type === "draft");
    expect(draft?.type === "draft" && draft.draft.channelId).not.toBe("thanks");
    const start = events.find((event) => event.type === "start");
    expect(start?.type === "start" && start.asked).toBeUndefined();
  });
});

describe("カードを送る", () => {
  it("お願いの仕組みには乗せず（受信箱・回す・ゴールに出ない）、ありがとうの記録（封筒・カード帳の数）ができる", async () => {
    const outcome = await handlePublish(
      scripted,
      teams,
      "aoki",
      { subject: "【ありがとう】野田 翔さんへ", text: "野田 翔さん、ありがとう！", channelId: "thanks", askedPersonId: "noda" },
      db,
    );
    expect(outcome.status).toBe(200);
    expect(listInbox(db, "noda").map((item) => item.subject)).not.toContain("【ありがとう】野田 翔さんへ");
    expect(listThanks(db, "noda")[0]).toMatchObject({ fromName: "青木 ひより", message: "野田 翔さん、ありがとう！" });
    if (outcome.status !== 200) throw new Error("送れなかった");
    const { postId } = outcome.body;
    expect(listPassCandidates(db, teams, postId, "noda")).toEqual([]);
    const goals = countContributions(db, "noda").goals;
    teams.createReply("noda", postId, "こちらこそ");
    expect(countContributions(db, "noda").goals).toBe(goals);
  });

  it("送った直後に取り消すと、ありがとうの記録も消える", async () => {
    const before = listThanks(db, "noda").length;
    const outcome = await handlePublish(
      scripted,
      teams,
      "aoki",
      { subject: "【ありがとう】野田 翔さんへ", text: "取り消すカード", channelId: "thanks", askedPersonId: "noda" },
      db,
    );
    expect(listThanks(db, "noda").length).toBe(before + 1);
    if (outcome.status !== 200) throw new Error("送れなかった");
    expect(handleUndo(teams, "aoki", { postId: outcome.body.postId }, new Date(), db).status).toBe(200);
    expect(listThanks(db, "noda").length).toBe(before);
  });

  it("同じ言葉のカードを2枚送って片方を取り消しても、もう片方の記録は残る（post_id で消す）", async () => {
    const send = () =>
      handlePublish(scripted, teams, "aoki", { subject: "【ありがとう】野田 翔さんへ", text: "同じ言葉", channelId: "thanks", askedPersonId: "noda" }, db);
    const first = await send();
    const second = await send();
    if (first.status !== 200 || second.status !== 200) throw new Error("送れなかった");
    handleUndo(teams, "aoki", { postId: first.body.postId }, new Date(), db);
    const rows = db.prepare("SELECT post_id FROM thanks WHERE message = '同じ言葉'").all() as { post_id: string }[];
    expect(rows.map((row) => row.post_id)).toEqual([second.body.postId]);
  });

  it("札をふつうの種類に戻したら、ありがとうの記録は作らない", async () => {
    const before = listThanks(db, "noda").length;
    await handlePublish(scripted, teams, "aoki", { subject: "【うまくいった】野田 翔さんへ", text: "教えてもらった", channelId: "study" }, db);
    expect(listThanks(db, "noda").length).toBe(before);
  });
});

describe("Teams の「ありがとう」チャネルへ（偽の fetch）", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "koekata-card-"));
    vi.stubEnv("KOEKATA_GRAPH_DIR", dir);
    vi.stubEnv("KOEKATA_TEAMS", "");
    vi.stubEnv("KOEKATA_TEAMS_WEBHOOK_URL", "");
    writeFileSync(join(dir, "teams-token-aoki.json"), JSON.stringify({ accessToken: "token-aoki", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }));
    resetTeamsBridge();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  function fake() {
    const sent: { url: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/me/joinedTeams")) return new Response(JSON.stringify({ value: [{ id: "team1", displayName: "T" }] }));
      if (url.endsWith("/teams/team1/channels")) return new Response(JSON.stringify({ value: [{ id: "chan1", displayName: "ありがとう" }] }));
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ id: "m1" }));
    });
    return { sent, fetcher: fetcher as unknown as typeof fetch };
  }

  it("対応表にあれば、件名とメンションつきで送る", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify({ tenant: "example.test", clientId: "dummy", channels: { thanks: { team: "T", channel: "ありがとう" } } }));
    const { sent, fetcher } = fake();
    const result = await sendPostToTeams(db, "aoki", "p1", "thanks", "ありがとう！", { subject: "【ありがとう】野田 翔さんへ", askedPersonId: "noda" }, fetcher);
    expect(result).toEqual({ state: "sent" });
    const body = sent[0].body as { subject: string; body: { content: string } };
    expect(body.subject).toBe("【ありがとう】野田 翔さんへ");
    expect(body.body.content.startsWith("野田 翔さん")).toBe(true);
  });

  it("本文の頭の「〇〇さん、」はメンションに替え、名前を二重にしない", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify({ tenant: "example.test", clientId: "dummy", channels: { thanks: { team: "T", channel: "ありがとう" } } }));
    const { sent, fetcher } = fake();
    await sendPostToTeams(db, "aoki", "p1", "thanks", "野田 翔さん、ありがとう！", { subject: "【ありがとう】野田 翔さんへ", askedPersonId: "noda" }, fetcher);
    const body = sent[0].body as { body: { content: string } };
    expect(body.body.content).toBe("野田 翔さん\nありがとう！");
  });

  it("対応表になければ、アプリの中に残る", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify({ tenant: "example.test", clientId: "dummy", channels: { study: { team: "T", channel: "C" } } }));
    const { sent, fetcher } = fake();
    const result = await sendPostToTeams(db, "aoki", "p1", "thanks", "ありがとう！", { subject: "【ありがとう】野田 翔さんへ", askedPersonId: "noda" }, fetcher);
    expect(result).toEqual({ state: "skipped", reason: "kept" });
    expect(sent).toHaveLength(0);
  });
});
