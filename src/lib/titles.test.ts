import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { getDestination } from "./destination/current";
import { seedDatabase } from "./seed";
import { handleSendThanks } from "./thanks";
import { applyTitleAction, handleSuggestTitles, listTitles, offerTitle, suggestTitles, wornTitle } from "./titles";

const NOW = new Date("2026-11-04T01:00:00Z");
const scripted = createScriptedClaude();
let db: DatabaseSync;

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

async function give(title: unknown, to = "aoki", from = "saeki") {
  return handleSendThanks(scripted, db, from, { toPersonId: to, message: "助かりました", title }, NOW);
}

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("肩書きを贈る", () => {
  it("サンクスカードに添えて贈れて、受け取るまで名前の横に出ない", async () => {
    expect((await give("文化祭動画の師匠")).status).toBe(200);
    const [entry] = listTitles(db, "aoki").filter((t) => t.title === "文化祭動画の師匠");
    expect(entry).toMatchObject({ state: "offered", worn: false, fromName: expect.any(String) });
    expect(wornTitle(db, "aoki")).toBeNull();
  });

  it("肩書きなしでも、ありがとうは送れる", async () => {
    const before = listTitles(db, "aoki").length;
    expect((await give(undefined)).status).toBe(200);
    expect(listTitles(db, "aoki").length).toBe(before);
  });

  it("自分には贈れない", async () => {
    expect((await give("自称の師匠", "saeki", "saeki")).status).toBe(400);
    expect(offerTitle(db, "saeki", "saeki", "自称の師匠", NOW)).toBe(false);
  });

  it("長すぎる肩書きや空の肩書きは受けない", async () => {
    expect((await give("あ".repeat(21))).status).toBe(400);
    expect((await give("   ")).status).toBe(400);
  });

  it("判定で止まった肩書きは、ありがとうごと届かない", async () => {
    const { client } = recording({ verdict: "block", perception: "傷つける言葉です", alternatives: [] });
    const before = (db.prepare("SELECT count(*) AS n FROM thanks").get() as { n: number }).n;
    const outcome = await handleSendThanks(client, db, "saeki", { toPersonId: "aoki", message: "ありがとう", title: "ひどいあだ名" }, NOW);
    expect(outcome.status).toBe(422);
    expect(listTitles(db, "aoki").map((t) => t.title)).not.toContain("ひどいあだ名");
    expect((db.prepare("SELECT count(*) AS n FROM thanks").get() as { n: number }).n).toBe(before);
  });

  it("判定に肩書きの言葉も渡す", async () => {
    const { client, requests } = recording({ verdict: "ok", perception: "よさそう", alternatives: [] });
    await handleSendThanks(client, db, "saeki", { toPersonId: "aoki", message: "ありがとう", title: "図書室の相談役" }, NOW);
    expect(requests[0].messages[0].content).toContain("図書室の相談役");
  });
});

describe("肩書きを使う", () => {
  async function received(title = "図書室の相談役") {
    await give(title);
    return listTitles(db, "aoki").find((t) => t.title === title)?.id as string;
  }

  it("受け取って1つ選ぶと名前の横に出て、選び直せて、外せる", async () => {
    const first = await received("図書室の相談役");
    const second = await received("過去問の達人");
    expect(applyTitleAction(db, "aoki", first, "wear", NOW)).toBe(false);
    applyTitleAction(db, "aoki", first, "accept", NOW);
    applyTitleAction(db, "aoki", second, "accept", NOW);
    expect(applyTitleAction(db, "aoki", first, "wear", NOW)).toBe(true);
    expect(wornTitle(db, "aoki")).toBe("図書室の相談役");
    applyTitleAction(db, "aoki", second, "wear", NOW);
    expect(wornTitle(db, "aoki")).toBe("過去問の達人");
    applyTitleAction(db, "aoki", second, "unwear", NOW);
    expect(wornTitle(db, "aoki")).toBeNull();
  });

  it("コレクションから外すと、名前の横からも消える", async () => {
    const id = await received();
    applyTitleAction(db, "aoki", id, "accept", NOW);
    applyTitleAction(db, "aoki", id, "wear", NOW);
    expect(applyTitleAction(db, "aoki", id, "remove", NOW)).toBe(true);
    expect(wornTitle(db, "aoki")).toBeNull();
    expect(listTitles(db, "aoki").map((t) => t.id)).not.toContain(id);
  });

  it("断ると一覧から消え、贈った人の一覧には何も出ない", async () => {
    const id = await received();
    expect(applyTitleAction(db, "aoki", id, "decline", NOW)).toBe(true);
    expect(listTitles(db, "aoki").map((t) => t.id)).not.toContain(id);
    expect(listTitles(db, "saeki").map((t) => t.id)).not.toContain(id);
  });

  it("他の人のコレクションは変えられない", async () => {
    const id = await received();
    expect(applyTitleAction(db, "saeki", id, "accept", NOW)).toBe(false);
    expect(applyTitleAction(db, "noda", id, "decline", NOW)).toBe(false);
    expect(listTitles(db, "aoki").find((t) => t.id === id)?.state).toBe("offered");
  });
});

describe("肩書きの案", () => {
  it("材料は公開の言葉だけで、案は3つまで、長いものは捨てる", async () => {
    const { client, requests } = recording({ titles: ["相談役", "師匠", "達人", "名人", "あ".repeat(21)] });
    expect(await suggestTitles(client, ["図書室の話"])).toEqual(["相談役", "師匠", "達人"]);
    expect(requests[0].messages[0].content).toContain("図書室の話");
  });

  it("言葉がなければ Claude を呼ばない", async () => {
    const { client, requests } = recording({ titles: ["相談役"] });
    expect(await suggestTitles(client, [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("案を出すだけでは、誰にも贈られない", async () => {
    const before = listTitles(db, "noda").length;
    const outcome = await handleSuggestTitles(scripted, db, getDestination(db), "saeki", { toPersonId: "noda" });
    expect(outcome.status).toBe(200);
    expect(listTitles(db, "noda").length).toBe(before);
  });

  it("台本では本物を呼ばず、自分への案は出さない", async () => {
    expect(scripted.mode).toBe("scripted");
    const outcome = await handleSuggestTitles(scripted, db, getDestination(db), "saeki", { toPersonId: "saeki" });
    expect(outcome.status).toBe(400);
  });
});
