import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ChatMessage, ClaudeClient, ClaudeRequest } from "./claude/types";
import { getReport, handleCheck, handleDaily, handleEvening, handleMake, handleRespond, japanDate, listReceived, recipientsOf } from "./daily";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { seedDatabase } from "./seed";

const scripted = createScriptedClaude();
const NOW = new Date("2026-11-04T09:00:00Z"); // 18:00
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

async function make(person = "saeki", conversation = talk) {
  const outcome = await handleMake(scripted, db, person, { conversation }, NOW);
  expect(outcome.status).toBe(200);
  const report = getReport(db, person, DATE);
  if (!report) throw new Error("まとめが作られていない");
  return report;
}

describe("届く相手", () => {
  it("先生の日報は管理職へ、生徒の日記は担任へ", () => {
    expect(recipientsOf(db, "saeki").map((r) => r.id)).toEqual(["fujimoto"]);
    expect(recipientsOf(db, "aoki").map((r) => r.id)).toEqual(["saeki"]);
    expect(recipientsOf(db, "nakamura").map((r) => r.id)).toEqual(["kawamura"]);
    expect(recipientsOf(db, "fujimoto")).toEqual([]);
  });
});

describe("まとめ", () => {
  it("項目ごとに作られ、初めはどれもチェックが付いていない", async () => {
    const report = await make();
    expect(report.items.map((i) => i.text)).toEqual(["作文を褒めた", "保護者の電話で疲れた"]);
    expect(report.items.every((i) => !i.checked)).toBe(true);
  });

  it("今日の投稿や返信も材料になり、昨日のものは入らない", async () => {
    const teams = createDummyTeams(db);
    teams.createReply("noda", "post-making-1", "今日の返信");
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ items: ["項目"] }), refused: false };
      },
    };
    await handleMake(recording, db, "noda", { conversation: [] }, new Date());
    const prompt = requests[0].messages[0].content;
    expect(prompt).toContain("今日の返信");
    expect(prompt).not.toContain("ネットワークは最後まで苦手");
  });

  it("相棒の言葉は材料にせず、本人の話だけを使う", async () => {
    const requests: ClaudeRequest[] = [];
    const recording: ClaudeClient = {
      mode: "real",
      complete: async (request) => {
        requests.push(request);
        return { text: JSON.stringify({ items: ["項目"] }), refused: false };
      },
    };
    await handleMake(recording, db, "saeki", { conversation: talk }, NOW);
    expect(requests[0].messages[0].content).not.toContain("ええやん");
  });

  it("話した内容そのものを、チェックなしで他の人に見せない", async () => {
    await make();
    expect(JSON.stringify(listReceived(db, "fujimoto"))).not.toContain("保護者の電話");
  });

  it("材料がなければ Claude を呼ばず、作らない", async () => {
    const complete = vi.fn();
    const outcome = await handleMake({ mode: "real", complete }, db, "saeki", { conversation: [] }, NOW);
    expect(outcome.body.report).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it("壊れた答えや断られたときは作らない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: ClaudeClient = { mode: "real", complete: async () => ({ text: "壊れ", refused: false }) };
    expect((await handleMake(broken, db, "saeki", { conversation: talk }, NOW)).status).toBe(503);
    const refused: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    expect((await handleMake(refused, db, "saeki", { conversation: talk }, NOW)).status).toBe(503);
    expect(getReport(db, "saeki", DATE)).toBeNull();
    log.mockRestore();
  });

  it("届いている項目があるうちは作り直せない。外せば作り直せる", async () => {
    const report = await make();
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: true });
    expect((await handleMake(scripted, db, "saeki", { conversation: talk }, NOW)).status).toBe(409);

    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: false });
    expect((await handleMake(scripted, db, "saeki", { conversation: talk }, NOW)).status).toBe(200);
  });

  it("一言が届いたあとは、チェックを外しても作り直せず、一言は消えない", async () => {
    const report = await make();
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: true });
    await handleRespond(scripted, db, "fujimoto", { reportId: report.id, text: "いいですね" }, NOW);
    handleCheck(db, "saeki", { itemId: report.items[0].id, checked: false });

    expect((await handleMake(scripted, db, "saeki", { conversation: talk }, NOW)).status).toBe(409);
    expect(getReport(db, "saeki", DATE)?.responses).toHaveLength(1);
  });

  it("おかしな会話の記録は受け付けない", async () => {
    const outcome = await handleMake(scripted, db, "saeki", { conversation: [{ role: "system", content: "x" }] }, NOW);
    expect(outcome.status).toBe(400);
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

describe("夕方のまとめの係", () => {
  const post = (person = "saeki") =>
    db
      .prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, 'study', ?, 'effort', ?, ?)")
      .run(`evening-${person}`, person, "今日は作文を読んだ", NOW.toISOString());

  it("材料は人に届いたやり取りだけで、相棒との話を渡さず、チェックは付かない", async () => {
    post();
    const summarize = vi.fn(async () => ({ items: ["作文を読んだ"], usage: null }));
    // handleDaily は今の日時で今日のやり取りを探すので、投稿と同じ日に合わせる
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const outcome = await handleDaily(scripted, db, "saeki", { action: "evening", conversation: talk }, { summarize }).finally(() => vi.useRealTimers());
    expect(outcome.status).toBe(200);
    expect(outcome.body.madeBy).toBe("agent");
    const material = (summarize.mock.calls as unknown as string[][][])[0][0].join("\n");
    expect(material).toContain("今日は作文を読んだ");
    expect(material).not.toContain("保護者の電話");
    const report = getReport(db, "saeki", DATE);
    expect(report?.madeBy).toBe("agent");
    expect(report?.items.every((item) => !item.checked)).toBe(true);
  });

  it("係がなければ、手動のまとめに戻り、そう返す", async () => {
    post();
    const outcome = await handleEvening(scripted, null, db, "saeki", NOW);
    expect(outcome.body.madeBy).toBe("manual");
    expect(getReport(db, "saeki", DATE)?.madeBy).toBe("manual");
  });

  it("時間切れや不正な形で失敗すると、手動のまとめに戻る", async () => {
    post();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const outcome = await handleEvening(
      scripted,
      { summarize: async () => { throw new Error("時間切れ"); } },
      db,
      "saeki",
      NOW,
    );
    spy.mockRestore();
    expect(outcome.status).toBe(200);
    expect(outcome.body.madeBy).toBe("manual");
  });

  it("やり取りがなければ、係を起こさない", async () => {
    const summarize = vi.fn(async () => ({ items: [], usage: null }));
    const outcome = await handleEvening(scripted, { summarize }, db, "saeki", NOW);
    expect(summarize).not.toHaveBeenCalled();
    expect(outcome.body.madeBy).toBeNull();
  });

  it("届いている項目があれば、係でも作り直さない", async () => {
    post();
    const first = await make();
    handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
    const summarize = vi.fn(async () => ({ items: ["x"], usage: null }));
    const outcome = await handleEvening(scripted, { summarize }, db, "saeki", NOW);
    expect(outcome.status).toBe(409);
    expect(summarize).not.toHaveBeenCalled();
  });

  it("作っている間に項目が共有されたら、置き換えずに残す", async () => {
    post();
    const first = await make();
    const summarize = vi.fn(async () => {
      handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
      return { items: ["新しい項目"], usage: null };
    });
    const outcome = await handleEvening(scripted, { summarize }, db, "saeki", NOW);
    expect(outcome.status).toBe(409);
    const kept = getReport(db, "saeki", DATE);
    expect(kept?.id).toBe(first.id);
    expect(kept?.items.find((item) => item.id === first.items[0].id)?.checked).toBe(true);
  });

  it("作っている間に一言が届いたら、置き換えずに残す", async () => {
    post();
    const first = await make();
    const summarize = vi.fn(async () => {
      db.prepare("INSERT INTO report_responses (id, report_id, from_person_id, text, created_at) VALUES ('late', ?, 'fujimoto', '返事', ?)").run(first.id, NOW.toISOString());
      return { items: ["新しい項目"], usage: null };
    });
    const outcome = await handleEvening(scripted, { summarize }, db, "saeki", NOW);
    expect(outcome.status).toBe(409);
    expect(getReport(db, "saeki", DATE)?.id).toBe(first.id);
  });

  it("手動のまとめでも、作っている間に共有されたら置き換えない", async () => {
    const first = await make();
    const sharing: ClaudeClient = {
      mode: "real",
      complete: async () => {
        handleCheck(db, "saeki", { itemId: first.items[0].id, checked: true });
        return { text: JSON.stringify({ items: ["新しい項目"] }), refused: false };
      },
    };
    const outcome = await handleMake(sharing, db, "saeki", { conversation: talk }, NOW);
    expect(outcome.status).toBe(409);
    expect(getReport(db, "saeki", DATE)?.id).toBe(first.id);
  });
});
