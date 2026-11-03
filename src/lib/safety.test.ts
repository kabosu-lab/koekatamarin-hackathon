import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient } from "./claude/types";
import { openDatabase } from "./db";
import { assessSafety, isCounselingOpen, listAlertsFor, listShareCandidates, recordAlert, shareAlert } from "./safety";
import { hotlines } from "./safety-hotlines";
import { seedDatabase } from "./seed";
import { handleTalk } from "./talk-request";

const NOW = new Date("2026-11-04T01:00:00Z"); // 水曜 10:00（日本時間）
const scripted = createScriptedClaude();
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

function answering(text: string, refused = false): ClaudeClient {
  return { mode: "real", complete: async () => ({ text, refused }) };
}

describe("assessSafety", () => {
  it("断られて確かめられないときは、見逃さない側に倒す", async () => {
    const result = await assessSafety(answering("", true), [], "……");
    expect(result.concern).toBe(true);
    expect(result.summary).not.toBe("");
  });

  it("心配がないときは要点を持たない", async () => {
    const result = await assessSafety(answering('{"concern":false,"summary":"余計な要約"}'), [], "疲れた");
    expect(result).toEqual({ concern: false, summary: "" });
  });

  it("形が違う答えは失敗にする", async () => {
    await expect(assessSafety(answering('{"concern":"はい"}'), [], "x")).rejects.toThrow();
    await expect(assessSafety(answering("壊れている"), [], "x")).rejects.toThrow();
  });
});

describe("isCounselingOpen", () => {
  it.each([
    ["2026-11-04T01:00:00Z", true, "水曜 10:00"],
    ["2026-11-03T23:30:00Z", true, "水曜 8:30"],
    ["2026-11-03T23:29:00Z", false, "水曜 8:29"],
    ["2026-11-04T08:00:00Z", false, "水曜 17:00"],
    ["2026-11-04T07:59:00Z", true, "水曜 16:59"],
    ["2026-11-07T01:00:00Z", false, "土曜 10:00"],
    ["2026-11-08T01:00:00Z", false, "日曜 10:00"],
    ["2026-11-04T15:00:00Z", false, "水曜 24:00"],
  ])("%s は %s（%s）", (time, expected) => {
    expect(isCounselingOpen(new Date(time))).toBe(expected);
  });
});

describe("handleTalk", () => {
  const worrying = { history: [], text: "もう死にたい" };

  it("心配があれば相談室にだけ届き、担任など他の先生には届かない", async () => {
    const outcome = await handleTalk(scripted, db, "aoki", worrying, NOW);

    expect(outcome.status).toBe(200);
    expect(outcome.body.safety?.counselingOpen).toBe(true);
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(1);
    for (const other of ["saeki", "ogawara", "fujimoto", "aoki", "nakamura"]) {
      expect(listAlertsFor(db, other)).toEqual([]);
    }
  });

  it("相談室に届くのは要点だけで、話した言葉は保存しない", async () => {
    await handleTalk(scripted, db, "aoki", { history: [], text: "親に殴られて、秘密の話をした" }, NOW);

    expect(JSON.stringify(listAlertsFor(db, "shiraishi"))).not.toContain("秘密の話");
    const stored = JSON.stringify(db.prepare("SELECT * FROM safety_alerts").all());
    expect(stored).not.toContain("秘密の話");
  });

  it("心配がなければ何も届かず、案内も出ない", async () => {
    const outcome = await handleTalk(scripted, db, "aoki", { history: [], text: "今日は頑張った" }, NOW);
    expect(outcome.body.safety).toBeUndefined();
    expect(listAlertsFor(db, "shiraishi")).toEqual([]);
  });

  it("時間外は本人に閉まっていることを伝える", async () => {
    const outcome = await handleTalk(scripted, db, "aoki", worrying, new Date("2026-11-04T13:00:00Z"));
    expect(outcome.body.safety?.counselingOpen).toBe(false);
  });

  it("同じ話が続いても、知らせを増やさない", async () => {
    await handleTalk(scripted, db, "aoki", worrying, NOW);
    await handleTalk(scripted, db, "aoki", worrying, new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(1);

    await handleTalk(scripted, db, "aoki", worrying, new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(2);
  });

  it("確認に失敗しても、会話は止めない", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const claude: ClaudeClient = {
      mode: "real",
      complete: async ({ task }) => {
        if (task === "safety") throw new Error("秘密の話");
        return { text: "聞いてるよ", refused: false };
      },
    };

    const outcome = await handleTalk(claude, db, "aoki", worrying, NOW);

    expect(outcome.status).toBe(200);
    expect(JSON.stringify(log.mock.calls)).not.toContain("秘密の話");
    log.mockRestore();
  });

  it("返事が作れなくても、相談室には届き、本人に知らせる", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const claude: ClaudeClient = {
      mode: "real",
      complete: async ({ task }) => {
        if (task === "safety") return { text: '{"concern":true,"summary":"要点"}', refused: false };
        throw new Error("通信の失敗");
      },
    };

    const outcome = await handleTalk(claude, db, "aoki", worrying, NOW);

    expect(outcome.status).toBe(503);
    expect(outcome.body.safety).toBeDefined();
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(1);
    log.mockRestore();
  });

  it("形の正しくない依頼では確認しない", async () => {
    const complete = vi.fn();
    const outcome = await handleTalk({ mode: "real", complete }, db, "aoki", { text: "" }, NOW);
    expect(outcome.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("shareAlert", () => {
  function alert() {
    return recordAlert(db, "aoki", "要点", NOW);
  }

  it("本人が選んだ先生にだけ届く", () => {
    const id = alert();
    expect(shareAlert(db, id, "aoki", ["saeki"])).toBe(true);

    expect(listAlertsFor(db, "saeki")[0].recipients).toEqual(["佐伯 みどり"]);
    expect(listAlertsFor(db, "ogawara")).toEqual([]);
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(1);
  });

  it("本人以外は、届ける先を足せない", () => {
    const id = alert();
    expect(shareAlert(db, id, "nakamura", ["saeki"])).toBe(false);
    expect(shareAlert(db, id, "saeki", ["ogawara"])).toBe(false);
    expect(listAlertsFor(db, "ogawara")).toEqual([]);
  });

  it("生徒には届けられない", () => {
    expect(shareAlert(db, alert(), "aoki", ["nakamura"])).toBe(false);
    expect(listAlertsFor(db, "nakamura")).toEqual([]);
  });

  it("選べる先に生徒と相談室は入らない", () => {
    const ids = listShareCandidates(db, "aoki").map((c) => c.id);
    expect(ids).toContain("saeki");
    expect(ids).not.toContain("nakamura");
    expect(ids).not.toContain("shiraishi");
  });

  it("相談室を外すことはできない", () => {
    const id = alert();
    shareAlert(db, id, "aoki", []);
    expect(listAlertsFor(db, "shiraishi")).toHaveLength(1);
  });
});

describe("外部の窓口", () => {
  it("いつでもつながる窓口と、緊急の番号がある", () => {
    const text = JSON.stringify(hotlines);
    expect(text).toContain("0120-0-78310");
    expect(text).toContain("110");
    expect(text).toContain("119");
  });
});
