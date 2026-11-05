import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { activeEvents, EVENTS, isInEvent } from "./events";
import { handleRibbon, listNewRibbons, listPublicRibbons, listRibbons, syncRibbons } from "./ribbons";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T03:00:00Z");
let db: DatabaseSync;
const ids = (personId: string) => listRibbons(db, personId).map((ribbon) => ribbon.id);

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("リボン", () => {
  it("人を助けた行動で届く", () => {
    syncRibbons(db, "noda", NOW);
    expect(ids("noda")).toContain("first-answer");
  });

  it("投稿や応援だけでは、初めての投稿のほかは届かない", () => {
    db.prepare("INSERT INTO post_likes (post_id, person_id) VALUES ('post-clubs-1', 'saeki') ON CONFLICT DO NOTHING").run();
    db.prepare("DELETE FROM replies WHERE author_id = 'nakamura'").run();
    db.prepare("DELETE FROM thanks WHERE to_person_id = 'nakamura'").run();
    syncRibbons(db, "nakamura", NOW);
    expect(ids("nakamura").filter((id) => id !== "first-post")).toEqual([]);
  });

  it("元の行動が消えても、一度もらったリボンは減らない", () => {
    syncRibbons(db, "noda", NOW);
    const before = ids("noda");
    db.prepare("DELETE FROM replies WHERE author_id = 'noda'").run();
    syncRibbons(db, "noda", new Date("2027-02-01T03:00:00Z"));
    expect(ids("noda")).toEqual(expect.arrayContaining(before));
  });

  it("並びは定義の順だけで、順位や点数を返さない", () => {
    syncRibbons(db, "noda", NOW);
    const [first] = listRibbons(db, "noda");
    expect(Object.keys(first).sort()).toEqual(["art", "description", "hidden", "id", "isPublic", "name", "quip", "selfOnly", "story", "storyAt"]);
  });

  it("他の人には、本人が公開を選んだものだけ見える", () => {
    syncRibbons(db, "noda", NOW);
    expect(listPublicRibbons(db, "noda")).toEqual([]);
    expect(handleRibbon(db, "noda", { action: "public", id: "first-answer", isPublic: true }).status).toBe(200);
    expect(listPublicRibbons(db, "noda").map((ribbon) => ribbon.id)).toEqual(["first-answer"]);
  });

  it("他の人のリボンの公開は変えられない", () => {
    syncRibbons(db, "noda", NOW);
    expect(handleRibbon(db, "aoki", { action: "public", id: "first-answer", isPublic: true }).status).toBe(404);
    expect(listPublicRibbons(db, "noda")).toEqual([]);
  });

  it("新しいリボンは一度だけ知らせる", () => {
    syncRibbons(db, "noda", NOW);
    expect(listNewRibbons(db, "noda").length).toBeGreaterThan(0);
    handleRibbon(db, "noda", { action: "seen" }, NOW);
    expect(listNewRibbons(db, "noda")).toEqual([]);
  });
});

describe("イベント", () => {
  const event = { ...EVENTS[0], start: "2026-11-01", end: "2026-11-07", ribbon: { id: "event-test", name: "テスト", description: "テスト" } };
  const help = (at: string) =>
    db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, 'aoki', 'noda', 'ありがとう', ?)").run(at, at);

  it("日本時間の両端を含む", () => {
    expect(isInEvent(event, new Date("2026-10-31T15:00:00Z"))).toBe(true);
    expect(isInEvent(event, new Date("2026-10-31T14:59:00Z"))).toBe(false);
    expect(isInEvent(event, new Date("2026-11-07T14:59:00Z"))).toBe(true);
    expect(isInEvent(event, new Date("2026-11-07T15:00:00Z"))).toBe(false);
  });

  it("期間外には出ない", () => {
    expect(activeEvents(new Date("2026-11-08T03:00:00Z"), [event])).toEqual([]);
    expect(activeEvents(NOW, [event])).toEqual([event]);
  });

  it("期間中に誰かの力になるとリボンが届き、期間外の行動では届かない", () => {
    const person = "aoki";
    help("2026-10-01T03:00:00Z");
    syncRibbons(db, person, NOW, [event]);
    expect(ids(person)).not.toContain("event-test");
  });

  it("イベントのリボンは、定義された期間の行動で届く", () => {
    help("2026-11-03T03:00:00Z");
    const real = EVENTS.find((e) => isInEvent(e, NOW));
    expect(real).toBeTruthy();
    syncRibbons(db, "aoki", NOW);
    expect(ids("aoki")).toContain(real?.ribbon.id);
  });
});

describe("もらった物語", () => {
  const story = (personId: string, id: string) => listRibbons(db, personId).find((ribbon) => ribbon.id === id)?.story;

  it("公開の相談なら、誰の役に立ったかの一言と、その日が残る", () => {
    syncRibbons(db, "ogawara", NOW);
    const ribbon = listRibbons(db, "ogawara").find((r) => r.id === "first-answer");
    expect(ribbon?.story).toMatch(/さんの相談に、初めて答えた日$/);
    expect(ribbon?.storyAt).toBeTruthy();
    expect(new Date(ribbon?.storyAt ?? "").getTime()).toBeLessThan(NOW.getTime());
  });

  it("範囲を絞った相談では、相手の名前も中身も出さない", () => {
    db.prepare("UPDATE posts SET scope = 'self' WHERE id IN (SELECT post_id FROM replies WHERE author_id = 'ogawara')").run();
    syncRibbons(db, "ogawara", NOW);
    expect(story("ogawara", "first-answer")).toBe("誰かの相談に、初めて答えた日");
  });

  it("一度決まった物語は、あとで投稿が変わっても書き換えない", () => {
    syncRibbons(db, "ogawara", NOW);
    const before = story("ogawara", "first-answer");
    db.prepare("UPDATE posts SET scope = 'self'").run();
    syncRibbons(db, "ogawara", NOW);
    expect(story("ogawara", "first-answer")).toBe(before);
  });

  it("他の人のプロフィールに、物語は出さない", () => {
    syncRibbons(db, "ogawara", NOW);
    handleRibbon(db, "ogawara", { action: "public", id: "first-answer", isPublic: true }, NOW);
    const [ribbon] = listPublicRibbons(db, "ogawara");
    expect(ribbon).toBeDefined();
    expect(JSON.stringify(ribbon)).not.toContain("さんの相談");
  });

  it("もらった瞬間にも物語を渡す", () => {
    syncRibbons(db, "ogawara", NOW);
    expect(listNewRibbons(db, "ogawara")[0].story.length).toBeGreaterThan(0);
  });
});
