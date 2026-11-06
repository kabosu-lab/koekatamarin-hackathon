import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ChatMessage, ClaudeClient, ClaudeRequest } from "./claude/types";
import {
  getReport,
  handleCheck,
  handleDaily,
  handleEdit,
  handleEvening,
  handleRespond,
  handleSync,
  japanDate,
  listReceived,
  recipientsOf,
} from "./daily";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { seedDatabase } from "./seed";

const scripted = createScriptedClaude();
const NOW = new Date("2026-11-04T09:00:00Z"); // 18:00
const NOON = new Date("2026-11-04T03:00:00Z"); // 12:00
const DATE = japanDate(NOW);
const talk: ChatMessage[] = [
  { role: "user", content: "作文を褒めた" },
  { role: "assistant", content: "ええやん" },
  { role: "user", content: "保護者の電話で疲れた" },
];

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

async function make(person = "saeki", conversation = talk, now = NOW) {
  const outcome = await handleSync(scripted, db, person, { conversation }, now);
  expect(outcome.status).toBe(200);
  const report = getReport(db, person, japanDate(now));
  if (!report) throw new Error("まとめが作られていない");
  return report;
}

/** 呼ばれた中身を残し、決まった項目を返す Claude */
function recording(items: string[] | ((request: ClaudeRequest) => string[])) {
  const requests: ClaudeRequest[] = [];
  const client: ClaudeClient = {
    mode: "real",
    complete: async (request) => {
      requests.push(request);
      const list = typeof items === "function" ? items(request) : items;
      return { text: JSON.stringify({ items: list }), refused: false };
    },
  };
  return { client, requests, prompt: (n = 0) => String(requests[n].messages[0].content) };
}

function post(id: string, body: string, at = NOW, person = "saeki") {
  db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, 'study', ?, 'effort', ?, ?)").run(
    id,
    person,
    body,
    at.toISOString(),
  );
}

const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("届く相手", () => {
  it("先生の日報は管理職へ、生徒の日記は担任へ", () => {
    expect(recipientsOf(db, "saeki").map((r) => r.id)).toEqual(["fujimoto"]);
    expect(recipientsOf(db, "aoki").map((r) => r.id)).toEqual(["saeki"]);
    expect(recipientsOf(db, "nakamura").map((r) => r.id)).toEqual(["kawamura"]);
    expect(recipientsOf(db, "fujimoto")).toEqual([]);
  });
});

describe("開いたらまとまる", () => {
  it("項目ごとに作られ、初めはどれもチェックが付いていない", async () => {
    const report = await make();
    expect(report.items.map((i) => i.text)).toEqual(["作文を褒めた", "保護者の電話で疲れた"]);
    expect(report.items.every((i) => !i.checked && !i.edited)).toBe(true);
  });

  it("今日の投稿や返信も材料になり、昨日のものは入らない", async () => {
    const teams = createDummyTeams(db);
    teams.createReply("noda", "post-making-1", "今日の返信");
    const claude = recording(["項目"]);
    await handleSync(claude.client, db, "noda", { conversation: [] }, new Date());
    expect(claude.prompt()).toContain("今日の返信");
    expect(claude.prompt()).not.toContain("ネットワークは最後まで苦手");
  });

  it("パートナーの言葉は材料にせず、本人の話だけを使う", async () => {
    const claude = recording(["項目"]);
    await handleSync(claude.client, db, "saeki", { conversation: talk }, NOW);
    expect(claude.prompt()).not.toContain("ええやん");
  });

  it("話の中身はサーバーに残さない（同じ発言かどうかの指紋だけ）", async () => {
    await make();
    const row = db.prepare("SELECT talk_seen FROM daily_reports WHERE person_id = 'saeki' AND date = ?").get(DATE) as { talk_seen: string };
    expect(row.talk_seen).not.toContain("保護者");
    expect(JSON.parse(row.talk_seen)).toHaveLength(2);
  });

  it("話した内容そのものを、チェックなしで他の人に見せない", async () => {
    await make();
    expect(JSON.stringify(listReceived(db, "fujimoto"))).not.toContain("保護者の電話");
  });

  it("何もない日は Claude を呼ばず、作らない", async () => {
    const complete = vi.fn();
    const outcome = await handleSync({ mode: "real", complete }, db, "saeki", { conversation: [] }, NOW);
    expect(outcome.status).toBe(200);
    expect(outcome.body.report).toBeNull();
    expect(outcome.body.called).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it("パートナーの言葉だけの話（本人がまだ話していない）でも呼ばない", async () => {
    const complete = vi.fn();
    await handleSync({ mode: "real", complete }, db, "saeki", { conversation: [{ role: "assistant", content: "おつかれ" }] }, NOW);
    expect(complete).not.toHaveBeenCalled();
  });

  it("壊れた答えや断られたときは作らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: ClaudeClient = { mode: "real", complete: async () => ({ text: "壊れ", refused: false }) };
    expect((await handleSync(broken, db, "saeki", { conversation: talk }, NOW)).status).toBe(503);
    const refused: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    expect((await handleSync(refused, db, "saeki", { conversation: talk }, NOW)).status).toBe(503);
    expect(getReport(db, "saeki", DATE)).toBeNull();
    log.mockRestore();
  });

  it("おかしな会話の記録は受け付けない", async () => {
    const outcome = await handleSync(scripted, db, "saeki", { conversation: [{ role: "system", content: "x" }] }, NOW);
    expect(outcome.status).toBe(400);
  });
});

describe("足し算で整え直す", () => {
  it("前から何も増えていなければ、Claude を呼ばずに保存したものを返す", async () => {
    const first = await make();
    const complete = vi.fn();
    const outcome = await handleSync({ mode: "real", complete }, db, "saeki", { conversation: talk }, later(30));
    expect(complete).not.toHaveBeenCalled();
    expect(outcome.body.called).toBe(false);
    expect(getReport(db, "saeki", DATE)).toEqual(first);
  });

  it("増えたときだけ、前の日報と増えた分だけを渡す", async () => {
    post("first-post", "朝の投稿", later(-60));
    await make();

    post("second-post", "放課後の投稿", later(10));
    const more: ChatMessage[] = [...talk, { role: "assistant", content: "うん" }, { role: "user", content: "部活を見に行った" }];
    const claude = recording((request) => [...String(request.messages[0].content).matchAll(/^(?:項目|投稿|本人)：(.*)$/gm)].map((m) => m[1]));
    await handleSync(claude.client, db, "saeki", { conversation: more }, later(20));

    expect(claude.requests).toHaveLength(1);
    const prompt = claude.prompt();
    // 前の日報の項目と、増えた分
    expect(prompt).toContain("<前の日報>");
    expect(prompt).toContain("項目：作文を褒めた");
    expect(prompt).toContain("投稿：放課後の投稿");
    expect(prompt).toContain("本人：部活を見に行った");
    // もう含めた話ややり取りは、生のまま渡し直さない
    expect(prompt).not.toContain("本人：作文を褒めた");
    expect(prompt).not.toContain("投稿：朝の投稿");

    const texts = getReport(db, "saeki", DATE)?.items.map((i) => i.text);
    expect(texts).toEqual(expect.arrayContaining(["作文を褒めた", "放課後の投稿", "部活を見に行った"]));

    // 足したあとにもう一度開いても、もう呼ばない
    const complete = vi.fn();
    await handleSync({ mode: "real", complete }, db, "saeki", { conversation: more }, later(25));
    expect(complete).not.toHaveBeenCalled();
  });

  it("本人が直した項目は上書きせず、変えない項目として渡す", async () => {
    const first = await make();
    expect(handleEdit(db, "saeki", { itemId: first.items[0].id, text: "作文のよいところを3つ伝えた" }).status).toBe(200);

    const claude = recording(["保護者の電話で疲れた", "作文のよいところを3つ伝えた", "部活を見に行った"]);
    await handleSync(claude.client, db, "saeki", { conversation: [...talk, { role: "user", content: "部活を見に行った" }] }, later(10));

    expect(claude.prompt()).toContain("直した項目：作文のよいところを3つ伝えた");
    expect(claude.prompt()).not.toContain("項目：作文を褒めた");
    const report = getReport(db, "saeki", DATE);
    const kept = report?.items.find((i) => i.id === first.items[0].id);
    expect(kept).toMatchObject({ text: "作文のよいところを3つ伝えた", edited: true });
    // 同じ文が重ならない
    expect(report?.items.filter((i) => i.text === "作文のよいところを3つ伝えた")).toHaveLength(1);
    expect(report?.items.map((i) => i.text)).toContain("部活を見に行った");
  });

  it("届けた項目と届いた一言は、足し算のあとも残る", async () => {
    const first = await make();
    handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
    await handleRespond(scripted, db, "fujimoto", { reportId: first.id, text: "いいですね" }, NOW);

    const claude = recording(["保護者の電話で疲れた", "部活を見に行った"]);
    const outcome = await handleSync(claude.client, db, "saeki", { conversation: [...talk, { role: "user", content: "部活を見に行った" }] }, later(10));
    expect(outcome.status).toBe(200);
    const report = getReport(db, "saeki", DATE);
    expect(report?.id).toBe(first.id);
    expect(report?.items.find((i) => i.id === first.items[0].id)).toMatchObject({ text: "作文を褒めた", checked: true });
    expect(report?.responses).toHaveLength(1);
    expect(listReceived(db, "fujimoto")[0].items).toEqual(["作文を褒めた"]);
  });

  it("まとめている間に届けられたら置き換えず、次に開いたときにもう一度まとめる", async () => {
    const first = await make();
    const sharing = recording(() => {
      handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
      return ["新しい項目"];
    });
    const more = [...talk, { role: "user" as const, content: "部活を見に行った" }];
    const outcome = await handleSync(sharing.client, db, "saeki", { conversation: more }, later(10));
    expect(outcome.body.saved).toBe(false);
    const kept = getReport(db, "saeki", DATE);
    expect(kept?.items.map((i) => i.text)).toEqual(["作文を褒めた", "保護者の電話で疲れた"]);
    expect(kept?.items[0].checked).toBe(true);

    const again = recording(["保護者の電話で疲れた", "部活を見に行った"]);
    await handleSync(again.client, db, "saeki", { conversation: more }, later(11));
    expect(again.requests).toHaveLength(1);
  });

  it("Claude が空を返したら、項目なしで残し、次に開いても呼ばない", async () => {
    const empty = recording([]);
    await handleSync(empty.client, db, "saeki", { conversation: [{ role: "user", content: "おはよう" }] }, NOW);
    expect(getReport(db, "saeki", DATE)?.items).toEqual([]);
    expect(listReceived(db, "fujimoto")).toEqual([]);
    await handleSync(empty.client, db, "saeki", { conversation: [{ role: "user", content: "おはよう" }] }, later(5));
    expect(empty.requests).toHaveLength(1);
  });

  it("Claude が何も返さなくても、前の項目は消さない", async () => {
    await make();
    const empty = recording([]);
    await handleSync(empty.client, db, "saeki", { conversation: [...talk, { role: "user", content: "x" }] }, later(10));
    expect(getReport(db, "saeki", DATE)?.items.map((i) => i.text)).toEqual(["作文を褒めた", "保護者の電話で疲れた"]);
  });
});

describe("本人が直す", () => {
  it("本人だけが直せて、空や長すぎる言葉は受け付けない", async () => {
    const report = await make();
    expect(handleEdit(db, "fujimoto", { itemId: report.items[0].id, text: "x" }).status).toBe(404);
    expect(handleEdit(db, "saeki", { itemId: report.items[0].id, text: "  " }).status).toBe(400);
    expect(handleEdit(db, "saeki", { itemId: report.items[0].id, text: "あ".repeat(201) }).status).toBe(400);
    expect(getReport(db, "saeki", DATE)?.items[0]).toMatchObject({ text: "作文を褒めた", edited: false });
  });
});

describe("チェックした項目だけが届く", () => {
  it("チェックがなければ何も届かない", async () => {
    await make();
    expect(listReceived(db, "fujimoto")).toEqual([]);
  });

  it("チェックした項目だけが、決まった相手にだけ届く", async () => {
    const report = await make();
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: true });

    const received = listReceived(db, "fujimoto");
    expect(received).toHaveLength(1);
    expect(received[0].items).toEqual(["作文を褒めた"]);
    expect(JSON.stringify(received)).not.toContain("保護者の電話");

    for (const other of ["ogawara", "kawamura", "noda", "shiraishi", "aoki", "kinoshita", "nakamura", "saeki"]) {
      expect(listReceived(db, other)).toEqual([]);
    }
  });

  it("チェックを外すと届かなくなる", async () => {
    const report = await make();
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: true });
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: false });
    expect(listReceived(db, "fujimoto")).toEqual([]);
  });

  it("生徒の日記は担任にだけ届き、管理職や他の先生には届かない", async () => {
    const report = await make("aoki");
    handleCheck(db, "aoki", { itemId: report.items[0].id, checked: true });

    expect(listReceived(db, "saeki")).toHaveLength(1);
    for (const other of ["fujimoto", "ogawara", "kawamura", "shiraishi", "nakamura"]) {
      expect(listReceived(db, other)).toEqual([]);
    }
  });

  it("本人以外はチェックを変えられない", async () => {
    const report = await make();
    expect(handleCheck(db, "fujimoto", { itemId: report.items[0].id, checked: true }).status).toBe(404);
    expect(handleCheck(db, "aoki", { itemId: report.items[0].id, checked: true }).status).toBe(404);
    expect(listReceived(db, "fujimoto")).toEqual([]);
  });
});

describe("一言を返す", () => {
  async function delivered() {
    const report = await make();
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: true });
    return report;
  }

  it("受け取った人の一言が本人に届く", async () => {
    const report = await delivered();
    const outcome = await handleRespond(scripted, db, "fujimoto", { reportId: report.id, text: "いいですね" }, NOW);
    expect(outcome.status).toBe(200);
    expect(getReport(db, "saeki", DATE)?.responses).toEqual([
      expect.objectContaining({ fromName: "藤本 恵", text: "いいですね" }),
    ]);
  });

  it("届く相手以外は返せない", async () => {
    const report = await delivered();
    expect((await handleRespond(scripted, db, "ogawara", { reportId: report.id, text: "x" }, NOW)).status).toBe(404);
    expect((await handleRespond(scripted, db, "aoki", { reportId: report.id, text: "x" }, NOW)).status).toBe(404);
  });

  it("何も届いていない日報には返せない", async () => {
    const report = await make();
    expect((await handleRespond(scripted, db, "fujimoto", { reportId: report.id, text: "x" }, NOW)).status).toBe(404);
  });

  it("きつい一言は止まり、確かめられないときも送らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await delivered();
    expect((await handleRespond(scripted, db, "fujimoto", { reportId: report.id, text: "死ね" }, NOW)).status).toBe(422);
    const failing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        throw new Error("通信の失敗");
      },
    };
    expect((await handleRespond(failing, db, "fujimoto", { reportId: report.id, text: "x" }, NOW)).status).toBe(503);
    expect(getReport(db, "saeki", DATE)?.responses).toEqual([]);
    log.mockRestore();
  });
});

describe("夕方のまとめの係（自動で1日1回）", () => {
  const agentOf = (items: string[]) => vi.fn(async (_activity: string[]) => ({ items, usage: null }));

  it("夕方に開くと走る時だと返し、材料は人に届いたやり取りだけで、できた項目は日報に足される", async () => {
    post("evening-saeki", "今日は作文を読んだ");
    const summarize = agentOf(["作文を読んだ", "作文を褒めた"]);
    const synced = await handleSync(scripted, db, "saeki", { conversation: talk }, NOW, { summarize });
    expect(synced.body.eveningDue).toBe(true);

    const outcome = await handleEvening({ summarize }, db, "saeki", NOW);
    expect(outcome.status).toBe(200);
    expect(outcome.body.madeBy).toBe("agent");
    const material = summarize.mock.calls[0][0].join("\n");
    expect(material).toContain("今日は作文を読んだ");
    expect(material).not.toContain("保護者の電話");
    const report = getReport(db, "saeki", DATE);
    expect(report?.madeBy).toBe("agent");
    expect(report?.items.map((i) => i.text)).toContain("作文を読んだ");
    // 同じ文は重ねない
    expect(report?.items.filter((i) => i.text === "作文を褒めた")).toHaveLength(1);
    expect(report?.items.every((item) => !item.checked)).toBe(true);
  });

  it("1日1回だけ。2回目は係を起こさず、走る時とも返さない", async () => {
    post("evening-saeki", "今日は作文を読んだ");
    const summarize = agentOf(["作文を読んだ"]);
    await handleEvening({ summarize }, db, "saeki", NOW);
    await handleEvening({ summarize }, db, "saeki", later(30));
    expect(summarize).toHaveBeenCalledTimes(1);
    const synced = await handleSync(scripted, db, "saeki", { conversation: talk }, later(40), { summarize });
    expect(synced.body.eveningDue).toBe(false);
  });

  it("夕方より前、係の設定がない、やり取りがない、のどれかなら起こさない", async () => {
    const summarize = agentOf(["x"]);
    expect((await handleEvening({ summarize }, db, "saeki", NOW)).body.madeBy).toBeNull();
    post("evening-saeki", "今日は作文を読んだ", NOON);
    expect((await handleEvening({ summarize }, db, "saeki", NOON)).body.madeBy).toBeNull();
    expect((await handleEvening(null, db, "saeki", NOW)).body.madeBy).toBeNull();
    expect(summarize).not.toHaveBeenCalled();
    expect((await handleSync(scripted, db, "saeki", { conversation: [] }, NOW, null)).body.eveningDue).toBe(false);
  });

  it("届けた項目があっても消さずに足し、失敗したらその日はもう起こさない", async () => {
    post("evening-saeki", "今日は作文を読んだ");
    const first = await make();
    handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = vi.fn(async () => {
      throw new Error("時間切れ");
    });
    const outcome = await handleEvening({ summarize: failing }, db, "saeki", NOW);
    log.mockRestore();
    expect(outcome.status).toBe(200);
    expect(outcome.body.madeBy).toBeNull();
    expect(getReport(db, "saeki", DATE)?.items.find((i) => i.id === first.items[0].id)?.checked).toBe(true);

    const summarize = agentOf(["作文を読んだ"]);
    await handleEvening({ summarize }, db, "saeki", later(5));
    expect(summarize).not.toHaveBeenCalled();
  });

  it("画面からは action で呼べ、夕方のボタン用の手動のまとめには戻らない", async () => {
    post("evening-saeki", "今日は作文を読んだ", new Date());
    const complete = vi.fn();
    const outcome = await handleDaily({ mode: "real", complete }, db, "saeki", { action: "evening" }, null);
    expect(outcome.status).toBe(200);
    expect(complete).not.toHaveBeenCalled();
    expect((await handleDaily(scripted, db, "saeki", { action: "make" })).status).toBe(400);
  });
});
