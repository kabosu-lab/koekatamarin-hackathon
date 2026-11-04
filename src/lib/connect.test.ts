import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ChatMessage, ClaudeClient, ClaudeRequest } from "./claude/types";
import { handleDraft, handlePublish } from "./compose-request";
import { buildConnectTargets, buildDirectory, handleConnect, suggestPerson } from "./connect";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { seedDatabase } from "./seed";
import { handleTalk } from "./talk-request";

const MORNING = new Date("2026-11-04T01:00:00Z"); // 10:00
const EVENING = new Date("2026-11-04T09:00:00Z"); // 18:00
const SECRET = "誰にも言っていない秘密の悩み";

const talk: ChatMessage[] = [
  { role: "user", content: "クラスのことで悩んでて" },
  { role: "assistant", content: "そっか、聞かせて" },
  { role: "user", content: "もう煮詰まってきた" },
  { role: "assistant", content: "しんどいな" },
];

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function answering(answer: unknown, refused = false): ClaudeClient {
  return { mode: "real", complete: async () => ({ text: JSON.stringify(answer), refused }) };
}

function suggest(claude: ClaudeClient, viewer = "saeki", now = MORNING, history = talk) {
  return suggestPerson(claude, history, buildDirectory(db, teams, viewer), now);
}

describe("buildDirectory", () => {
  it("本人は紹介先に入らない", () => {
    expect(buildDirectory(db, teams, "saeki").map((p) => p.id)).not.toContain("saeki");
  });

  it("生徒の紹介の材料に、職員室の投稿は入らない", () => {
    const words = JSON.stringify(buildDirectory(db, teams, "aoki"));
    expect(words).not.toContain("席替え");
    expect(JSON.stringify(buildDirectory(db, teams, "kawamura"))).toContain("電話で話を聞く");
  });
});

describe("同姓同名", () => {
  it("名前が同じでも、別の人の言葉を混ぜない", async () => {
    db.prepare("UPDATE people SET name = ? WHERE id = ?").run("野田 翔", "ogawara");
    const noda = buildDirectory(db, teams, "saeki").find((p) => p.id === "noda");
    const other = buildDirectory(db, teams, "saeki").find((p) => p.id === "ogawara");
    expect(JSON.stringify(noda?.publicWords)).toContain("ネットワーク");
    expect(JSON.stringify(other?.publicWords)).not.toContain("ネットワーク");
  });
});

describe("声をかけるとき", () => {
  it.each(["resolved", "stuck"])("%s のときは人を紹介する", async (moment) => {
    const result = await suggest(answering({ moment, personId: "ogawara", message: "大河原先生に聞いてみる？" }));
    expect(result).toMatchObject({ personId: "ogawara", name: "大河原 誠", moment });
  });

  it("話の途中では声をかけない", async () => {
    const answer = { moment: "none", personId: "ogawara", message: "聞いてみる？" };
    expect(await suggest(answering(answer))).toBeNull();
  });

  it("一日の終わりの声かけは、夕方以降だけ", async () => {
    const answer = { moment: "day_end", personId: "ogawara", message: "聞いてみる？" };
    expect(await suggest(answering(answer), "saeki", MORNING)).toBeNull();
    expect(await suggest(answering(answer), "saeki", EVENING)).not.toBeNull();
  });

  it("話が短いうちは、Claude に聞きもしない", async () => {
    const complete = vi.fn();
    expect(await suggest({ mode: "real", complete }, "saeki", MORNING, talk.slice(0, 2))).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it("一覧にない人や自分は紹介しない", async () => {
    const other = { moment: "stuck", personId: "nobody", message: "聞いてみる？" };
    expect(await suggest(answering(other))).toBeNull();
    const self = { moment: "stuck", personId: "saeki", message: "聞いてみる？" };
    expect(await suggest(answering(self))).toBeNull();
  });

  it("断られたときや、壊れた答えのときは何もせず、会話を止めない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await suggest(answering({}, true))).toBeNull();
    const broken: ClaudeClient = { mode: "real", complete: async () => ({ text: "壊れている", refused: false }) };
    const outcome = await handleConnect(broken, db, teams, "saeki", { history: talk }, MORNING);
    expect(outcome).toEqual({ status: 200, body: { suggestion: null } });
    log.mockRestore();
  });
});

describe("Claude との話は他の人に漏れない", () => {
  it("ある人の話は、別の人の紹介の材料にも、どの保存先にも入らない", async () => {
    await handleTalk(createScriptedClaude(), db, "aoki", { history: [], text: SECRET }, MORNING);

    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ moment: "none", personId: "aoki", message: "" }), refused: false };
      },
    };
    await handleConnect(recording, db, teams, "saeki", { history: talk }, MORNING);

    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests)).not.toContain(SECRET);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) {
      expect(JSON.stringify(db.prepare(`SELECT * FROM ${name}`).all())).not.toContain(SECRET);
    }
  });

  it("投稿すると公開された言葉として紹介の材料になる（本人が送ったものだけ）", async () => {
    const words = "投稿した勉強のコツ";
    await handlePublish(createScriptedClaude(), teams, "aoki", { text: words, channelId: "study" });
    const aoki = buildDirectory(db, teams, "saeki").find((p) => p.id === "aoki");
    expect(aoki?.publicWords).toContain(words);
  });
});

describe("聞く相手を決めて送る", () => {
  const input = { text: "お願いがあります", channelId: "study", askedPersonId: "ogawara" };

  it("投稿に聞く相手が残る", async () => {
    expect((await handlePublish(createScriptedClaude(), teams, "saeki", input)).status).toBe(200);
    expect(teams.listPosts("saeki", "study").at(-1)?.askedPersonName).toBe("大河原 誠");
  });

  it("相手が読めないチャネルでは送れず、下書きの送り先にも出ない", async () => {
    const outcome = await handlePublish(createScriptedClaude(), teams, "saeki", {
      ...input,
      channelId: "staffroom",
      askedPersonId: "aoki",
    });
    expect(outcome.status).toBe(400);

    const draft = await handleDraft(createScriptedClaude(), teams, "saeki", {
      history: [{ role: "user", content: "相談がある" }],
      askedPersonId: "aoki",
    });
    expect(draft.status === 200 && draft.body.channels.map((c) => c.id)).not.toContain("staffroom");
  });

  it("自分やいない人には聞けない", async () => {
    const scripted = createScriptedClaude();
    expect((await handlePublish(scripted, teams, "saeki", { ...input, askedPersonId: "saeki" })).status).toBe(400);
    expect((await handlePublish(scripted, teams, "saeki", { ...input, askedPersonId: "nobody" })).status).toBe(400);
    const history = [{ role: "user", content: "相談がある" }];
    expect((await handleDraft(scripted, teams, "saeki", { history, askedPersonId: "nobody" })).status).toBe(400);
  });
});

describe("生徒に生徒を紹介しない", () => {
  const history = talk;

  it("生徒の候補に生徒は入らず、先生とチャネルが入る", () => {
    const targets = buildConnectTargets(db, teams, "aoki");
    expect(targets.map((t) => t.id)).not.toContain("nakamura");
    expect(targets.map((t) => t.id)).not.toContain("kinoshita");
    expect(targets.map((t) => t.id)).toContain("noda");
    expect(targets.map((t) => t.id)).toContain("channel:making");
    expect(targets.map((t) => t.id)).not.toContain("channel:staffroom");
  });

  it("先生の候補は今のままで、生徒も入る", () => {
    expect(buildConnectTargets(db, teams, "saeki").map((t) => t.id)).toEqual(buildDirectory(db, teams, "saeki").map((t) => t.id));
  });

  it("Claude が生徒を選んでも、生徒には紹介しない", async () => {
    const claude = answering({ moment: "stuck", personId: "nakamura", message: "中村さんに聞いてみる？" });
    expect(await suggestPerson(claude, history, buildConnectTargets(db, teams, "aoki"), MORNING)).toBeNull();
  });

  it("チャネルを選ぶと、人ではなくチャネルを案内する", async () => {
    const claude = answering({ moment: "stuck", personId: "channel:making", message: "のぞいてみる？" });
    const suggestion = await suggestPerson(claude, history, buildConnectTargets(db, teams, "aoki"), MORNING);
    expect(suggestion).toMatchObject({ personId: "", channelId: "making", name: "ものづくり" });
  });

  it("handleConnect でも、生徒の候補を Claude に渡さない", async () => {
    const seen: ClaudeRequest[] = [];
    const claude: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        seen.push(request);
        return { text: JSON.stringify({ moment: "none", personId: "noda", message: "" }), refused: false };
      },
    };
    await handleConnect(claude, db, teams, "aoki", { history }, MORNING);
    expect(seen[0].messages[0].content).not.toContain("nakamura：");
    expect(seen[0].system).toContain("生徒に別の生徒を紹介しません");
  });
});
