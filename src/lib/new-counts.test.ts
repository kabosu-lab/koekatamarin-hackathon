import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import type { PostDestination } from "./destination/types";
import { countNew, markCollectionOpened, markInboxOpened, markThanksOpened, newsLine, type NewCounts, sideCounts } from "./new-counts";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T01:00:00Z"); // 水曜 10:00
const NIGHT = new Date("2026-11-04T13:00:00Z"); // 水曜 22:00
const SEEN = { rewards: true, todaySeen: true };

let db: DatabaseSync;
let teams: PostDestination;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  teams = createDummyTeams(db);
});

function thank(from: string, to: string, at: Date) {
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
    `t-${Math.random()}`,
    from,
    to,
    "ありがとう",
    at.toISOString(),
  );
}

const empty: NewCounts = { inbox: 0, replies: 0, asks: 0, reports: 0, thanks: 0, collection: 0, today: 0 };

describe("新着の数（0-2v）", () => {
  it("返事は受信箱に入り、受信箱を開くと消える", () => {
    const postId = teams.createPost("aoki", "study", "段取り表を作った");
    teams.createReply("saeki", postId, "いいですね");
    teams.createReply("noda", postId, "真似します");
    expect(countNew(db, teams, "aoki", NOW, SEEN)).toMatchObject({ inbox: 2, replies: 2 });
    markInboxOpened(db, "aoki");
    expect(countNew(db, teams, "aoki", NOW, SEEN)).toMatchObject({ inbox: 0, replies: 0 });
  });

  it("お願い（メンション）は応えるまで残り、時間外は数えない", () => {
    expect(countNew(db, teams, "saeki", NOW, SEEN).asks).toBe(2);
    markInboxOpened(db, "saeki");
    expect(countNew(db, teams, "saeki", NOW, SEEN).asks).toBe(2);
    expect(countNew(db, teams, "saeki", NIGHT, SEEN).inbox).toBe(0);
  });

  it("ありがとうは、開いたあとに届いた分だけ数える。隠した人からは数えない", () => {
    thank("saeki", "aoki", new Date("2026-11-04T00:00:00Z"));
    thank("noda", "aoki", new Date("2026-11-04T00:10:00Z"));
    expect(countNew(db, teams, "aoki", NOW, SEEN).thanks).toBe(2);
    markThanksOpened(db, "aoki", new Date("2026-11-04T00:30:00Z"));
    expect(countNew(db, teams, "aoki", NOW, SEEN).thanks).toBe(0);
    thank("saeki", "aoki", new Date("2026-11-04T00:40:00Z"));
    expect(countNew(db, teams, "aoki", NOW, SEEN).thanks).toBe(1);
    db.prepare("INSERT INTO hidden_people (person_id, hidden_person_id, created_at) VALUES (?, ?, ?)").run("aoki", "saeki", NOW.toISOString());
    expect(countNew(db, teams, "aoki", NOW, SEEN).thanks).toBe(0);
  });

  it("コレクションは開けていない卵と見ていないトロフィー。開いたら消え、報酬を隠している人には数えない", () => {
    db.prepare("INSERT INTO gift_eggs (id, person_id, earned_at) VALUES ('egg-1', 'aoki', ?)").run("2026-11-04T00:00:00.000Z");
    db.prepare("INSERT INTO person_ribbons (person_id, ribbon_id, earned_at) VALUES ('aoki', 'r-1', ?)").run("2026-11-04T00:00:00.000Z");
    expect(countNew(db, teams, "aoki", NOW, SEEN).collection).toBe(2);
    expect(countNew(db, teams, "aoki", NOW, { ...SEEN, rewards: false }).collection).toBe(0);
    markCollectionOpened(db, "aoki", new Date("2026-11-04T00:30:00Z"));
    expect(countNew(db, teams, "aoki", NOW, SEEN).collection).toBe(0);
    db.prepare("INSERT INTO gift_eggs (id, person_id, earned_at) VALUES ('egg-2', 'aoki', ?)").run("2026-11-04T00:40:00.000Z");
    expect(countNew(db, teams, "aoki", NOW, SEEN).collection).toBe(1);
  });

  it("今日の3人は、今日まだ見ていないときだけ数える", () => {
    const fresh = countNew(db, teams, "aoki", NOW, { rewards: true, todaySeen: false });
    expect(fresh.today).toBeGreaterThan(0);
    expect(fresh.today).toBeLessThanOrEqual(3);
    expect(countNew(db, teams, "aoki", NOW, SEEN).today).toBe(0);
  });

  it("ホームの左右の点：履歴と設定の側と、みんなの側", () => {
    expect(sideCounts({ ...empty, thanks: 1, collection: 2 })).toEqual({ me: 3, minna: 0 });
    expect(sideCounts({ ...empty, inbox: 2, today: 3 })).toEqual({ me: 0, minna: 5 });
  });
});

describe("パートナーの最初の一言", () => {
  it("返事だけのときは返事の数を言い、受信箱の返事へ行く", () => {
    expect(newsLine({ ...empty, inbox: 2, replies: 2 }, "student")).toEqual({
      text: "返事が2件届いてるよ。みんなのほうにあるよ",
      href: "/inbox#replies",
    });
    expect(newsLine({ ...empty, inbox: 2, replies: 2 }, "teacher")?.text).toBe("返事が2件届いています。みんなのほうにあります");
  });

  it("お願いも混ざるときは受信箱の数を言う", () => {
    expect(newsLine({ ...empty, inbox: 3, replies: 1, asks: 2 }, "teacher")).toEqual({
      text: "受信箱に3件届いています。みんなのほうにあります",
      href: "/inbox",
    });
  });

  it("コレクションは履歴と設定へ行き、ありがとうはその場で開ける", () => {
    // 0-3a：ありがとうは、その場で封筒を開ける
    expect(newsLine({ ...empty, thanks: 1 }, "student")).toEqual({ text: "ありがとうが届いてるよ", href: "#thanks-reveal" });
    expect(newsLine({ ...empty, thanks: 2 }, "teacher")?.text).toBe("ありがとうが届いています");
    expect(newsLine({ ...empty, collection: 1 }, "student")?.href).toBe("/me?open=partner");
  });

  it("新着がない、または今日の3人だけのときは、いつもの一言のまま", () => {
    expect(newsLine(empty, "student")).toBeNull();
    expect(newsLine({ ...empty, today: 3 }, "student")).toBeNull();
  });
});
