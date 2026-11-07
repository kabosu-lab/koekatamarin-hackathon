import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { setHidden } from "./hidden-people";
import { markThanksOpened } from "./new-counts";
import { seedDatabase } from "./seed";
import { ensureWelcomeThanks, listUnopenedThanks } from "./thanks-reveal";

const NOW = new Date("2026-11-07T01:00:00Z");
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  // 種の中のカードは開けたことにして、今日の1枚だけを見る
  for (const id of ["saeki", "ogawara", "aoki", "noda"]) markThanksOpened(db, id, new Date("2026-11-06T00:00:00Z"));
});

describe("今日の1枚（ダミーの同僚から）", () => {
  it("1人に1日1枚だけ入り、まだ開いていない", () => {
    expect(ensureWelcomeThanks(db, "aoki", NOW)).toBe(true);
    expect(ensureWelcomeThanks(db, "aoki", new Date("2026-11-07T10:00:00Z"))).toBe(false);
    const cards = listUnopenedThanks(db, "aoki");
    expect(cards).toHaveLength(1);
    expect(cards[0].fromId).not.toBe("aoki");
    expect(cards[0].createdAt).toBe(NOW.toISOString());
  });

  it("次の日（日本時間）には、また1枚", () => {
    ensureWelcomeThanks(db, "aoki", NOW);
    expect(ensureWelcomeThanks(db, "aoki", new Date("2026-11-07T15:30:00Z"))).toBe(true);
    expect(listUnopenedThanks(db, "aoki")).toHaveLength(2);
  });

  it("先生には学年主任から、学年主任には別の先生から。先生にはです・ます", () => {
    ensureWelcomeThanks(db, "noda", NOW);
    ensureWelcomeThanks(db, "ogawara", NOW);
    const noda = listUnopenedThanks(db, "noda")[0];
    expect(noda.fromId).toBe("ogawara");
    expect(noda.message).toMatch(/ます|でした/);
    expect(listUnopenedThanks(db, "ogawara")[0].fromId).toBe("saeki");
  });

  it("言葉から種類を読み取って付ける", () => {
    ensureWelcomeThanks(db, "aoki", NOW);
    expect(["thanks", "effort", "congrats"]).toContain(listUnopenedThanks(db, "aoki")[0].kind);
  });
});

describe("まだ開いていないカード", () => {
  it("開いたあとは出ない。しばらく出さない人からのものも出さない", () => {
    ensureWelcomeThanks(db, "aoki", NOW);
    const [card] = listUnopenedThanks(db, "aoki");
    setHidden(db, "aoki", card.fromId, true, NOW);
    expect(listUnopenedThanks(db, "aoki")).toHaveLength(0);
    setHidden(db, "aoki", card.fromId, false, NOW);
    markThanksOpened(db, "aoki", new Date(card.createdAt));
    expect(listUnopenedThanks(db, "aoki")).toHaveLength(0);
  });
});
