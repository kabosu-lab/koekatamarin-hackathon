import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import { openDatabase } from "./db";
import { setHidden } from "./hidden-people";
import { seedDatabase } from "./seed";
import { handleSendThanks, listThanks } from "./thanks";
import { draftThanksFromWords, listRecentPartners, replyAuthors, searchThanksPeople } from "./thanks-people";

const NOW = new Date("2026-11-07T01:00:00Z");
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("最近やりとりした人", () => {
  it("ありがとうを送った人が先頭に来て、自分は出ない", async () => {
    await handleSendThanks(createScriptedClaude(), db, "aoki", { toPersonId: "nakamura", message: "助かりました" }, NOW);
    const recent = listRecentPartners(db, "aoki");
    expect(recent[0]).toEqual({ id: "nakamura", name: "中村 結衣", label: "1年・吹奏楽部" });
    expect(recent.some((p) => p.id === "aoki")).toBe(false);
    expect(recent.length).toBeLessThanOrEqual(5);
    // 同じ人は1回だけ
    expect(new Set(recent.map((p) => p.id)).size).toBe(recent.length);
  });

  it("返事をくれた人も入る", () => {
    db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "r-test",
      (db.prepare("SELECT id FROM posts WHERE author_id = 'kinoshita' LIMIT 1").get() as { id: string }).id,
      "fujimoto",
      "いいですね",
      "2099-01-01T00:00:00Z",
    );
    expect(listRecentPartners(db, "kinoshita")[0].id).toBe("fujimoto");
    expect(replyAuthors(db, ["r-test"]).get("r-test")).toEqual({ id: "fujimoto", name: "藤本 恵", label: "教頭" });
  });

  it("しばらく出さないにした人は出さない", async () => {
    await handleSendThanks(createScriptedClaude(), db, "aoki", { toPersonId: "nakamura", message: "助かりました" }, NOW);
    setHidden(db, "aoki", "nakamura", true, NOW);
    expect(listRecentPartners(db, "aoki").some((p) => p.id === "nakamura")).toBe(false);
  });
});

describe("打って絞り込む", () => {
  it("名前の一部で絞れる。空白や呼び方があっても当たる", () => {
    expect(searchThanksPeople(db, "aoki", "野田").map((p) => p.id)).toEqual(["noda"]);
    expect(searchThanksPeople(db, "aoki", "野田先生").map((p) => p.id)).toEqual(["noda"]);
    expect(searchThanksPeople(db, "aoki", "中村結衣").map((p) => p.id)).toEqual(["nakamura"]);
  });

  it("学年・教科・部活でも当たる", () => {
    expect(searchThanksPeople(db, "aoki", "吹奏楽").map((p) => p.id)).toEqual(["nakamura"]);
    expect(searchThanksPeople(db, "aoki", "国語").map((p) => p.id)).toEqual(["saeki"]);
  });

  it("空なら誰も出さない。自分としばらく出さない人も出さない", () => {
    expect(searchThanksPeople(db, "aoki", "  ")).toEqual([]);
    expect(searchThanksPeople(db, "saeki", "佐伯")).toEqual([]);
    setHidden(db, "aoki", "noda", true, NOW);
    expect(searchThanksPeople(db, "aoki", "野田")).toEqual([]);
  });
});

describe("話した言葉から下書きを作る", () => {
  it("「〇〇先生にありがとうって伝えたい」から、相手と言葉が入る", () => {
    const draft = draftThanksFromWords(db, "aoki", "野田先生に、3Dプリンターを教えてくれてありがとうって伝えたい");
    expect(draft).toMatchObject({
      to: { id: "noda", name: "野田 翔" },
      message: "3Dプリンターを教えてくれてありがとう",
      kind: "thanks",
    });
  });

  it("「おめでとう」「頑張ってたね」も読み取る", () => {
    expect(draftThanksFromWords(db, "aoki", "中村さんに、コンクール入賞おめでとうって言いたい")).toMatchObject({
      to: { id: "nakamura" },
      message: "コンクール入賞おめでとう",
      kind: "congrats",
    });
    expect(draftThanksFromWords(db, "saeki", "木下くんに頑張ってたねって送りたい")).toMatchObject({
      to: { id: "kinoshita" },
      kind: "effort",
    });
  });

  it("言葉が名前だけなら、短い言葉を入れておく", () => {
    expect(draftThanksFromWords(db, "aoki", "大河原先生にありがとうって伝えたい")?.message).toBe("ありがとう");
    expect(draftThanksFromWords(db, "aoki", "藤本先生に伝えたい")?.message).toBe("ありがとう！");
  });

  it("名前が見つからない・自分・しばらく出さない人なら、下書きにしない", () => {
    expect(draftThanksFromWords(db, "aoki", "誰かにありがとうって言いたい")).toBeNull();
    expect(draftThanksFromWords(db, "aoki", "青木にありがとう")).toBeNull();
    setHidden(db, "aoki", "noda", true, NOW);
    expect(draftThanksFromWords(db, "aoki", "野田先生にありがとう")).toBeNull();
  });

  it("送ったカードは、言葉から読み取った種類つきで届く", async () => {
    await handleSendThanks(createScriptedClaude(), db, "aoki", { toPersonId: "nakamura", message: "合格おめでとう！" }, NOW);
    expect(listThanks(db, "nakamura")[0]).toMatchObject({ message: "合格おめでとう！", kind: "congrats" });
  });
});
