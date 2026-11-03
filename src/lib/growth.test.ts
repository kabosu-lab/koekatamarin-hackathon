import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isArtName, loadArt } from "./art";
import {
  chooseAvatar,
  countContributions,
  familyFor,
  getAvatar,
  handleChooseAvatar,
  stageFor,
} from "./avatar";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { getDraft, handleProfile } from "./profile";
import { bloomFor, countLeaves, getSakura, seasonOf } from "./sakura";
import { seedDatabase } from "./seed";
import { handleSendThanks, listThanks } from "./thanks";
import { handleTalk } from "./talk-request";

const scripted = createScriptedClaude();
const NOW = new Date("2026-11-04T01:00:00Z");
const empty = { posts: 0, comments: 0, cheers: 0, goals: 0, assists: 0, thanksReceived: 0 };

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function profile(input: unknown, person = "noda", claude: ClaudeClient = scripted) {
  return handleProfile(claude, db, teams, person, input);
}

function publicProfile(person: string): string {
  return (db.prepare("SELECT public_profile FROM people WHERE id = ?").get(person) as { public_profile: string }).public_profile;
}

describe("絵", () => {
  it("決まった名前の絵しか返さない", async () => {
    expect(isArtName("beast-1.png")).toBe(true);
    expect(await loadArt("../../.env")).toBeNull();
    expect(await loadArt("characters-sheet.png")).toBeNull();
    expect(await loadArt("beast-4.png")).toBeNull();
  });

  it("絵がない環境では、コードで描いた代わりを返す", async () => {
    const art = await loadArt("beast-1.png", "/存在しないフォルダ");
    expect(art).toMatchObject({ placeholder: true, contentType: "image/svg+xml" });
    expect(String(art?.body)).toContain("<svg");
    const school = await loadArt("school-haru.jpg", "/存在しないフォルダ");
    expect(school?.placeholder).toBe(true);
  });

  it("絵があれば、それを返す", async () => {
    const dir = mkdtempSync(join(tmpdir(), "koekata-art-"));
    writeFileSync(join(dir, "egg.png"), "画像");
    const art = await loadArt("egg.png", dir);
    expect(art).toMatchObject({ placeholder: false, contentType: "image/png" });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("分身", () => {
  it("問いかけの答えで系統が決まる", () => {
    expect(familyFor("creature", "listen")).toBe("bird");
    expect(familyFor("human", "make")).toBe("craft");
    expect(familyFor("robot", "listen")).toBeNull();
    expect(familyFor("human", "fight")).toBeNull();
  });

  it("最初は卵で、問いかけに答えると系統が決まる", () => {
    expect(getAvatar(db, "saeki")).toMatchObject({ family: null, image: "egg.png" });
    expect(handleChooseAvatar(db, "saeki", { kind: "human", style: "listen" }).status).toBe(200);
    expect(getAvatar(db, "saeki").family).toBe("elder");
  });

  it("一度決めた系統は上書きできない", () => {
    expect(chooseAvatar(db, "saeki", "human", "listen")).toBe(true);
    expect(chooseAvatar(db, "saeki", "creature", "make")).toBe(false);
    expect(getAvatar(db, "saeki").family).toBe("elder");
  });

  it("やり取りで育ち、生き物は卵から、人物は1段階目から始まる", () => {
    expect(stageFor("bird", empty)).toBe(0);
    expect(stageFor("bird", { ...empty, comments: 1 })).toBe(1);
    expect(stageFor("bird", { ...empty, comments: 50 })).toBe(3);
    expect(stageFor("coat", empty)).toBe(1);
    expect(stageFor("coat", { ...empty, comments: 50 })).toBe(5);
  });

  it("ゴールとアシストとありがとうは、より早く育つ", () => {
    expect(stageFor("coat", { ...empty, thanksReceived: 2 })).toBeGreaterThan(stageFor("coat", { ...empty, comments: 2 }));
  });

  it("Claude と話すだけでは育たない", async () => {
    const before = countContributions(db, "aoki");
    await handleTalk(scripted, db, "aoki", { history: [], text: "今日は頑張った" }, NOW);
    expect(countContributions(db, "aoki")).toEqual(before);
  });

  it("絵の名前が必ずある", () => {
    for (const person of ["ogawara", "kawamura", "noda", "shiraishi", "fujimoto", "aoki", "kinoshita", "nakamura", "saeki"]) {
      expect(isArtName(getAvatar(db, person).image)).toBe(true);
    }
  });
});

describe("サンクスカード", () => {
  it("受け取る人にだけ届き、分身が育つ材料になる", async () => {
    const outcome = await handleSendThanks(scripted, db, "aoki", { toPersonId: "noda", message: "助かりました" }, NOW);
    expect(outcome.status).toBe(200);
    expect(listThanks(db, "noda")[0]).toMatchObject({ fromName: "青木 ひより", message: "助かりました" });
    expect(listThanks(db, "aoki")).toEqual([]);
    expect(countContributions(db, "noda").thanksReceived).toBe(1);
  });

  it("自分や、いない人には送れない", async () => {
    expect((await handleSendThanks(scripted, db, "aoki", { toPersonId: "aoki", message: "x" })).status).toBe(400);
    expect((await handleSendThanks(scripted, db, "aoki", { toPersonId: "nobody", message: "x" })).status).toBe(400);
    expect((await handleSendThanks(scripted, db, "aoki", { toPersonId: "noda", message: " " })).status).toBe(400);
  });

  it("個人攻撃は送れず、確かめられないときも送らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleSendThanks(scripted, db, "aoki", { toPersonId: "noda", message: "死ね" })).status).toBe(422);
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };
    expect((await handleSendThanks(failing, db, "aoki", { toPersonId: "noda", message: "ありがとう" })).status).toBe(503);
    expect(listThanks(db, "noda")).toEqual([]);
    log.mockRestore();
  });
});

describe("プロフィール", () => {
  it("下書きを本人が確かめて載せるまで、公開されない", async () => {
    const before = publicProfile("noda");
    await profile({ action: "draft" });
    expect(getDraft(db, "noda")).not.toBeNull();
    expect(publicProfile("noda")).toBe(before);

    expect((await profile({ action: "publish" })).status).toBe(200);
    expect(publicProfile("noda")).not.toBe(before);
    expect(getDraft(db, "noda")).toBeNull();
  });

  it("材料は本人の公開された言葉だけで、Claude との話や他の人の投稿は入らない", async () => {
    await handleTalk(scripted, db, "noda", { history: [], text: "秘密の話" }, NOW);
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ ready: true, text: "下書き" }), refused: false };
      },
    };
    await profile({ action: "draft" }, "noda", recording);
    const prompt = JSON.stringify(requests[0].messages);
    expect(prompt).toContain("ネットワークは最後まで苦手");
    expect(prompt).not.toContain("秘密の話");
    expect(prompt).not.toContain("しおり立て"); // 他の人の投稿
  });

  it("同姓同名の別の人の言葉は、材料に入らない", async () => {
    db.prepare("UPDATE people SET name = ? WHERE id = ?").run("野田 翔", "ogawara");
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ ready: true, text: "下書き" }), refused: false };
      },
    };
    await profile({ action: "draft" }, "noda", recording);
    expect(JSON.stringify(requests[0].messages)).not.toContain("電話で話を聞く"); // 大河原先生の返信
  });

  it("言葉で直せるのは更新ごとに1回", async () => {
    await profile({ action: "draft" });
    expect((await profile({ action: "revise", request: "短くして" })).status).toBe(200);
    expect(getDraft(db, "noda")?.revised).toBe(true);
    expect((await profile({ action: "revise", request: "もう一度" })).status).toBe(409);

    await profile({ action: "draft" });
    expect(getDraft(db, "noda")?.revised).toBe(false);
  });

  it("手で書き換える入口はない", async () => {
    const before = publicProfile("noda");
    await profile({ action: "draft" });
    const draft = getDraft(db, "noda");
    const outcome = await profile({ action: "publish", text: "手で書いた文章" });
    expect(outcome.status).toBe(200);
    expect(publicProfile("noda")).toBe(draft?.text);
    expect(publicProfile("noda")).not.toBe(before);
    expect((await profile({ action: "edit", text: "手で書いた文章" })).status).toBe(404);
  });

  it("消すのはいつでもできる", async () => {
    expect((await profile({ action: "remove" })).status).toBe(200);
    expect(publicProfile("noda")).toBe("");
    expect((await profile({ action: "remove" })).status).toBe(200);
  });

  it("材料が足りなければ下書きを作らない", async () => {
    const claude: ClaudeClient = {
      mode: "real",
      complete: async () => ({ text: JSON.stringify({ ready: false, text: "" }), refused: false }),
    };
    expect((await profile({ action: "draft" }, "noda", claude)).body.draft).toBeNull();
    expect(getDraft(db, "noda")).toBeNull();
  });

  it("確かめられないときは載せない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await profile({ action: "draft" });
    const before = publicProfile("noda");
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };
    expect((await profile({ action: "publish" }, "noda", failing)).status).toBe(503);
    expect(publicProfile("noda")).toBe(before);
    log.mockRestore();
  });
});

describe("校内の桜", () => {
  it("季節は日付で決まる", () => {
    expect(seasonOf(new Date("2026-04-10T01:00:00Z"))).toBe("haru");
    expect(seasonOf(new Date("2026-07-10T01:00:00Z"))).toBe("natsu");
    expect(seasonOf(NOW)).toBe("aki");
    expect(seasonOf(new Date("2026-01-10T01:00:00Z"))).toBe("fuyu");
  });

  it("人に届いたやり取りが葉になり、Claude と話すだけでは増えない", async () => {
    const before = countLeaves(db, NOW);
    await handleTalk(scripted, db, "aoki", { history: [], text: "今日は頑張った" }, NOW);
    expect(countLeaves(db, NOW)).toBe(before);

    teams.createReply("aoki", "post-making-1", "すごい");
    expect(countLeaves(db, NOW)).toBe(before + 1);
  });

  it("お知らせは葉にならない", () => {
    const leaves = countLeaves(db, NOW);
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('n', 'notices', 'fujimoto', 'notice', 'x', ?)").run(NOW.toISOString());
    expect(countLeaves(db, NOW)).toBe(leaves);
  });

  it("年度が変わると数え直す", () => {
    expect(countLeaves(db, new Date("2027-05-01T01:00:00Z"))).toBe(0);
  });

  it("葉が少なくても枯れず、責めない。多ければ特別な咲き方になる", () => {
    expect(bloomFor(0)).toBe("控えめ");
    expect(bloomFor(150)).toBe("夜桜");
    const quiet = getSakura(db, new Date("2027-05-01T01:00:00Z"));
    expect(quiet.message).toContain("また次の一年");
    expect(quiet.message).not.toMatch(/枯れ|足りない|少ない/);

    const waiting = getSakura(db, new Date("2027-05-01T01:00:00Z"), "fuyu");
    expect(waiting.message).toContain("春を待っています");
  });
});
