import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { countContributions } from "./avatar";
import {
  draftReply,
  handleInboxReply,
  draftPass,
  handlePass,
  handlePassDraft,
  handlePassWithReply,
  passDraftTemplate,
  handleReplyDraft,
  isNoticeHours,
  listInbox,
  listPassCandidates,
} from "./inbox";
import { seedDatabase } from "./seed";

const scripted = createScriptedClaude();
const NOW = new Date("2026-11-04T01:00:00Z"); // 水曜 10:00
const STUDENT_ASK = "post-ask-1"; // 木下さん → 佐伯先生（ものづくり）
const STAFF_ASK = "post-ask-2"; // 川村先生 → 佐伯先生（職員室）

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

describe("受信箱", () => {
  it("自分に届いたお願いだけが見える", () => {
    expect(listInbox(db, "saeki").map((i) => i.postId)).toEqual([STUDENT_ASK, STAFF_ASK]);
    expect(listInbox(db, "noda")).toEqual([]);
  });

  it("返信すると受信箱から消え、投稿はゴールになる", async () => {
    const outcome = await handleInboxReply(scripted, db, teams, "saeki", { postId: STUDENT_ASK, text: "返信です" });
    expect(outcome.status).toBe(200);

    expect(listInbox(db, "saeki").map((i) => i.postId)).toEqual([STAFF_ASK]);
    expect(teams.listPosts("saeki", "making").find((p) => p.id === STUDENT_ASK)?.answered).toBe(true);
  });

  it("返信したお願いには、再送や古い画面からもう一度返せず、パスもできない", async () => {
    await handleInboxReply(scripted, db, teams, "saeki", { postId: STUDENT_ASK, text: "返信です" });

    expect((await handleInboxReply(scripted, db, teams, "saeki", { postId: STUDENT_ASK, text: "二重" })).status).toBe(404);
    expect((await handleReplyDraft(scripted, db, "saeki", { postId: STUDENT_ASK, spoken: "話" })).status).toBe(404);
    expect(handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda" }, NOW).status).toBe(404);
    expect(listInbox(db, "noda")).toEqual([]);
    const post = teams.listPosts("saeki", "making").find((p) => p.id === STUDENT_ASK);
    expect(post?.replies.filter((r) => r.authorId === "saeki")).toHaveLength(1);
  });

  it("他の人の返信では、お願いは消えない", () => {
    teams.createReply("noda", STUDENT_ASK, "横から一言");
    expect(listInbox(db, "saeki").map((i) => i.postId)).toContain(STUDENT_ASK);
    expect(teams.listPosts("saeki", "making").find((p) => p.id === STUDENT_ASK)?.answered).toBe(false);
  });
});

describe("時間外は通知しない", () => {
  it.each([
    ["2026-11-04T01:00:00Z", true, "水曜 10:00"],
    ["2026-11-03T22:00:00Z", true, "水曜 7:00"],
    ["2026-11-03T21:59:00Z", false, "水曜 6:59"],
    ["2026-11-04T10:00:00Z", false, "水曜 19:00"],
    ["2026-11-07T01:00:00Z", false, "土曜 10:00"],
    ["2026-11-08T01:00:00Z", false, "日曜 10:00"],
  ])("%s は %s（%s）", (time, expected) => {
    expect(isNoticeHours(new Date(time))).toBe(expected);
  });
});

describe("話して返す", () => {
  it("お願いと本人の話だけを Claude に渡す", async () => {
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ kind: "reply", text: "文章", question: "" }), refused: false };
      },
    };
    await draftReply(recording, "お願いの本文", "本人の話");
    expect(requests[0].messages).toHaveLength(1);
    expect(requests[0].messages[0].content).toContain("お願いの本文");
    expect(requests[0].messages[0].content).toContain("本人の話");
  });

  it("指示に、本人が話していない経験を足さない決まりがある", async () => {
    let system = "";
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        system = request.system;
        return { text: JSON.stringify({ kind: "ask_back", text: "", question: "どうでした？" }), refused: false };
      },
    };
    await draftReply(recording, "お願い", "話");
    expect(system).toContain("本人が話していない経験、気持ち、事実、助言を足さない");
  });

  it("中身がなければ文章を作らず、聞き返す", async () => {
    const outcome = await handleReplyDraft(scripted, db, "saeki", { postId: STAFF_ASK, spoken: "ようわからん" });
    expect(outcome.status).toBe(200);
    expect(outcome.body.draft).toEqual({ kind: "ask_back", question: expect.stringContaining("あなたのとき") });
    expect(outcome.body.review).toBeNull();
  });

  it("話した内容は、受け取られ方と一緒に返す", async () => {
    const outcome = await handleReplyDraft(scripted, db, "saeki", {
      postId: STAFF_ASK,
      spoken: "私はいいところを一つ書いてます",
    });
    expect(outcome.body.draft).toEqual({ kind: "reply", text: "私はいいところを一つ書いてます" });
    expect(outcome.body.review).toMatchObject({ verdict: "ok" });
  });

  it("壊れた答えや断られたときは、作文せず失敗にする", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: ClaudeClient = {
      mode: "real",
      complete: async () => ({ text: JSON.stringify({ kind: "reply", text: " ", question: "" }), refused: false }),
    };
    expect((await handleReplyDraft(broken, db, "saeki", { postId: STAFF_ASK, spoken: "話" })).status).toBe(503);
    const refused: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    expect((await handleReplyDraft(refused, db, "saeki", { postId: STAFF_ASK, spoken: "話" })).status).toBe(503);
    log.mockRestore();
  });

  it("自分に届いていないお願いには使えない", async () => {
    expect((await handleReplyDraft(scripted, db, "noda", { postId: STAFF_ASK, spoken: "話" })).status).toBe(404);
    expect((await handleInboxReply(scripted, db, teams, "noda", { postId: STAFF_ASK, text: "返信" })).status).toBe(404);
  });

  it("明らかな個人攻撃は返信でも止める。確かめられないときも送らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = teams.listPosts("saeki", "staffroom").find((p) => p.id === STAFF_ASK)?.replies.length;
    expect((await handleInboxReply(scripted, db, teams, "saeki", { postId: STAFF_ASK, text: "川村は死ね" })).status).toBe(422);
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };
    expect((await handleInboxReply(failing, db, teams, "saeki", { postId: STAFF_ASK, text: "返信" })).status).toBe(503);
    expect(teams.listPosts("saeki", "staffroom").find((p) => p.id === STAFF_ASK)?.replies.length).toBe(before);
    log.mockRestore();
  });
});

describe("パスとアシスト", () => {
  it("パスすると相手の受信箱へ移り、回した人が見える", () => {
    expect(handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda" }, NOW).status).toBe(200);

    expect(listInbox(db, "saeki").map((i) => i.postId)).not.toContain(STUDENT_ASK);
    expect(listInbox(db, "noda")[0]).toMatchObject({ postId: STUDENT_ASK, passedThrough: ["佐伯 みどり"] });
    expect(teams.listPosts("noda", "making").find((p) => p.id === STUDENT_ASK)).toMatchObject({
      askedPersonName: "野田 翔",
      passedThrough: ["佐伯 みどり"],
    });
  });

  it("相手が返信するとゴール、回した人にアシストが付く", async () => {
    handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda" }, NOW);
    expect(countContributions(db, "saeki")).toMatchObject({ goals: 0, assists: 0 });

    await handleInboxReply(scripted, db, teams, "noda", { postId: STUDENT_ASK, text: "底を厚くしましょう" });

    expect(countContributions(db, "noda")).toMatchObject({ goals: 1, assists: 0 });
    expect(countContributions(db, "saeki")).toMatchObject({ goals: 0, assists: 1 });
  });

  it("生徒には、職員室のお願いをパスできない", () => {
    expect(listPassCandidates(db, teams, STAFF_ASK, "saeki").map((p) => p.id)).not.toContain("aoki");
    expect(handlePass(db, teams, "saeki", { postId: STAFF_ASK, toPersonId: "aoki" }, NOW).status).toBe(404);
    expect(listInbox(db, "saeki").map((i) => i.postId)).toContain(STAFF_ASK);
  });

  it("投稿した本人、自分、すでに通った人には戻せない", () => {
    expect(handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "kinoshita" }, NOW).status).toBe(404);
    expect(handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "saeki" }, NOW).status).toBe(404);
    handlePass(db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda" }, NOW);
    expect(handlePass(db, teams, "noda", { postId: STUDENT_ASK, toPersonId: "saeki" }, NOW).status).toBe(404);
  });

  it("自分に届いていないお願いはパスできない", () => {
    expect(handlePass(db, teams, "noda", { postId: STUDENT_ASK, toPersonId: "ogawara" }, NOW).status).toBe(404);
  });
});

describe("回す（0-2g）", () => {
  it("下書きは「@〇〇さん、…どうですか？」の決まった形で、台本モードでも同じ", async () => {
    const result = await handlePassDraft(scripted, db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda" });
    expect(result).toEqual({
      status: 200,
      body: { text: "@野田 翔さん、情報・ものづくり部顧問の野田さんなら詳しいと思って、つなぎました。どうですか？" },
    });
  });

  it("本物の Claude には理由の一言だけを書かせ、名前と問いかけはこちらで付ける。だめなら決まった形", async () => {
    const real: ClaudeClient = { mode: "real", complete: vi.fn(async () => ({ text: JSON.stringify({ reason: "ものづくり部の顧問なので" }), refused: false })) };
    expect(await draftPass(real, "相談", { id: "noda", name: "野田 翔", label: "情報" })).toBe("@野田 翔さん、ものづくり部の顧問なので。どうですか？");
    const broken: ClaudeClient = { mode: "real", complete: vi.fn(async () => ({ text: "{", refused: false })) };
    expect(await draftPass(broken, "相談", { id: "noda", name: "野田 翔", label: "情報" })).toBe(passDraftTemplate({ id: "noda", name: "野田 翔", label: "情報" }));
  });

  it("本人が確かめた言葉を元の投稿への返事として送り、相手の受信箱へ移す", async () => {
    const text = "@野田 翔さん、詳しいと思って、つなぎました。どうですか？";
    const result = await handlePassWithReply(scripted, db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda", text }, NOW);
    expect(result.status).toBe(200);
    expect(listInbox(db, "saeki").map((i) => i.postId)).not.toContain(STUDENT_ASK);
    expect(listInbox(db, "noda")[0]).toMatchObject({ postId: STUDENT_ASK, passedThrough: ["佐伯 みどり"] });
    const post = teams.listPosts("noda", "making").find((p) => p.id === STUDENT_ASK);
    expect(post?.replies.at(-1)).toMatchObject({ authorId: "saeki", body: text });
    expect(post?.answered).toBe(false);
  });

  it("生徒には、職員室のお願いを回せない（下書きも作らない）", async () => {
    expect((await handlePassDraft(scripted, db, teams, "saeki", { postId: STAFF_ASK, toPersonId: "aoki" })).status).toBe(404);
    const result = await handlePassWithReply(scripted, db, teams, "saeki", { postId: STAFF_ASK, toPersonId: "aoki", text: "@青木 ひよりさん、どうですか？" }, NOW);
    expect(result.status).toBe(404);
    expect(listInbox(db, "saeki").map((i) => i.postId)).toContain(STAFF_ASK);
  });

  it("確かめられないときは回さず、返事も送らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing: ClaudeClient = { mode: "real", complete: vi.fn(async () => { throw new Error("down"); }) };
    const before = teams.listPosts("saeki", "making").find((p) => p.id === STUDENT_ASK)?.replies.length;
    const result = await handlePassWithReply(failing, db, teams, "saeki", { postId: STUDENT_ASK, toPersonId: "noda", text: "どうですか？" }, NOW);
    expect(result.status).toBe(503);
    expect(listInbox(db, "saeki").map((i) => i.postId)).toContain(STUDENT_ASK);
    expect(teams.listPosts("saeki", "making").find((p) => p.id === STUDENT_ASK)?.replies.length).toBe(before);
    log.mockRestore();
  });
});
