import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { getAvatar } from "./avatar";
import { CATALOG, catalogEntry } from "./avatar-catalog";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { createScriptedClaude } from "./claude/scripted";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { chooseFromEgg, eggCandidates, listCompanions, listGiftEggs, openGiftEgg, selectCompanion, syncGiftEggs } from "./gift-eggs";
import { seedDatabase } from "./seed";

const NOW = new Date("2026-11-04T03:00:00Z");
const scripted = createScriptedClaude();
let db: DatabaseSync;
let serial = 0;

function thanks(from: string, to: string, at: string) {
  serial += 1;
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, 'ありがとう', ?)").run(`t-${serial}`, from, to, at);
}

/** ある人に、ダミーの役に立った記録をなくす */
function clean(personId: string) {
  db.prepare("DELETE FROM replies WHERE author_id = ?").run(personId);
  db.prepare("DELETE FROM thanks WHERE to_person_id = ?").run(personId);
  db.prepare("DELETE FROM knowledge_contributors WHERE person_id = ?").run(personId);
}

const eggCount = (personId: string) => (db.prepare("SELECT count(*) AS n FROM gift_eggs WHERE person_id = ?").get(personId) as { n: number }).n;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  clean("noda");
});

describe("卵がもらえる条件", () => {
  it("投稿と応援だけでは出ない", () => {
    for (let i = 0; i < 12; i++) {
      db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, 'study', 'noda', 'effort', 'がんばった', ?)").run(`p-${i}`, `2026-10-0${(i % 9) + 1}T03:00:00Z`);
    }
    db.prepare("INSERT OR IGNORE INTO post_likes (post_id, person_id) VALUES ('post-clubs-1', 'noda')").run();
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(0);
  });

  it("人の役に立つと、3回で2人以上から届く", () => {
    thanks("aoki", "noda", "2026-10-01T03:00:00Z");
    thanks("aoki", "noda", "2026-10-02T03:00:00Z");
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(0);
    thanks("saeki", "noda", "2026-10-03T03:00:00Z");
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(1);
  });

  it("同じ相手だけでは、何度やり取りしても出ない", () => {
    for (let day = 1; day <= 9; day++) thanks("aoki", "noda", `2026-10-0${day}T03:00:00Z`);
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(0);
  });

  it("同じ相手からは1日1回しか数えない", () => {
    for (let i = 0; i < 5; i++) thanks("aoki", "noda", "2026-10-01T03:00:00Z");
    thanks("saeki", "noda", "2026-10-02T03:00:00Z");
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(0);
  });

  it("1日に1つまでで、次の日にまた届く", () => {
    for (let day = 1; day <= 6; day++) {
      thanks("aoki", "noda", `2026-10-0${day}T03:00:00Z`);
      thanks("saeki", "noda", `2026-10-0${day}T04:00:00Z`);
    }
    syncGiftEggs(db, "noda", NOW);
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(1);
    syncGiftEggs(db, "noda", new Date("2026-11-05T03:00:00Z"));
    expect(eggCount("noda")).toBe(2);
  });

  it("相談に返すと、役に立ったと数える", () => {
    const ask = (id: string, author: string) => {
      db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, 'study', ?, 'trouble', '教えて', '2026-10-01T03:00:00Z')").run(id, author);
      db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, 'noda', 'こうするよ', ?)").run(`r-${id}`, id, `2026-10-1${id.slice(-1)}T03:00:00Z`);
    };
    ask("a1", "aoki");
    ask("a2", "aoki");
    ask("a3", "saeki");
    syncGiftEggs(db, "noda", NOW);
    expect(eggCount("noda")).toBe(1);
  });
});

function giveEgg(personId: string): string {
  db.prepare("INSERT INTO gift_eggs (id, person_id, earned_at) VALUES (?, ?, ?)").run(`egg-${personId}-${serial++}`, personId, NOW.toISOString());
  return (db.prepare("SELECT id FROM gift_eggs WHERE person_id = ? AND opened_at IS NULL").get(personId) as { id: string }).id;
}

describe("卵を開ける", () => {
  const teams = () => createDummyTeams(db);

  it("必ず一覧の中の絵が生まれ、持っていないものを優先する", async () => {
    for (let i = 0; i < CATALOG.length - 1; i++) {
      const hatched = await openGiftEgg(scripted, db, teams(), "noda", giveEgg("noda"), NOW);
      expect(catalogEntry(hatched?.family)).toBeTruthy();
    }
    const families = listCompanions(db, "noda", NOW).map((c) => c.family);
    expect(new Set(families).size).toBe(families.length);
    expect(families).toHaveLength(CATALOG.length);
  });

  it("全部持っていても生まれ、何が出るかは毎回決まらない", () => {
    expect(eggCandidates(new Set(CATALOG.map((entry) => entry.id)))).toHaveLength(CATALOG.length);
    const seen = new Set<string>();
    return (async () => {
      for (let i = 0; i < 12; i++) seen.add((await chooseFromEgg(scripted, ["言葉"], CATALOG)).family);
      expect(seen.size).toBeGreaterThan(1);
    })();
  });

  it("開けても今のパートナーは変わらず、同じ卵は2度開かない", async () => {
    const before = getAvatar(db, "noda").family;
    const id = giveEgg("noda");
    expect(await openGiftEgg(scripted, db, teams(), "noda", id, NOW)).not.toBeNull();
    expect(getAvatar(db, "noda").family).toBe(before);
    expect(await openGiftEgg(scripted, db, teams(), "noda", id, NOW)).toBeNull();
    expect(listGiftEggs(db, "noda")).toEqual([]);
  });

  it("他の人の卵は開けられない", async () => {
    expect(await openGiftEgg(scripted, db, teams(), "aoki", giveEgg("noda"), NOW)).toBeNull();
  });

  it("パートナーがまだいない人には、生まれた子がそのままパートナーになる", async () => {
    db.prepare("DELETE FROM avatars WHERE person_id = 'noda'").run();
    const hatched = await openGiftEgg(scripted, db, teams(), "noda", giveEgg("noda"), NOW);
    expect(getAvatar(db, "noda").family).toBe(hatched?.family);
  });

  it("パートナーを選び直しても、育ちを失わない", async () => {
    db.prepare("UPDATE avatars SET family = 'craft', shown_stage = 4 WHERE person_id = 'noda'").run();
    const hatched = await openGiftEgg(scripted, db, teams(), "noda", giveEgg("noda"), NOW);
    expect(selectCompanion(db, "noda", hatched?.family, NOW)).toBe(true);
    expect(getAvatar(db, "noda").family).toBe(hatched?.family);
    expect(selectCompanion(db, "noda", "craft", NOW)).toBe(true);
    expect(db.prepare("SELECT family, shown_stage FROM avatars WHERE person_id = 'noda'").get()).toEqual({ family: "craft", shown_stage: 4 });
  });

  it("持っていないパートナーは選べない", () => {
    expect(selectCompanion(db, "noda", "cloud", NOW)).toBe(false);
    expect(selectCompanion(db, "noda", "nothing", NOW)).toBe(false);
  });
});

describe("Claude の選び", () => {
  function recording(answer: string): { client: ClaudeClient; requests: ClaudeRequest[] } {
    const requests: ClaudeRequest[] = [];
    return {
      requests,
      client: {
        mode: "real",
        async complete(request) {
          requests.push(request);
          return { text: answer, refused: false };
        },
      },
    };
  }

  it("候補にない絵を答えたら、コードで選ぶ", async () => {
    const { client } = recording(JSON.stringify({ family: "not-in-list", reason: "x" }));
    const picked = await chooseFromEgg(client, ["ロボットを作った"], CATALOG);
    expect(catalogEntry(picked.family)).toBeTruthy();
    expect(picked.family).not.toBe("not-in-list");
  });

  it("失敗してもコードで選ぶ", async () => {
    const client: ClaudeClient = { mode: "real", complete: () => Promise.reject(new Error("x")) };
    expect(catalogEntry((await chooseFromEgg(client, ["言葉"], CATALOG)).family)).toBeTruthy();
  });

  it("台本モードでは呼ばず、公開の言葉がなければ呼ばない", async () => {
    let called = false;
    const client: ClaudeClient = {
      mode: "scripted",
      complete: () => {
        called = true;
        return Promise.reject(new Error("呼ばない"));
      },
    };
    await chooseFromEgg(client, ["言葉"], CATALOG);
    await chooseFromEgg({ ...client, mode: "real" }, [], CATALOG);
    expect(called).toBe(false);
  });

  it("本人の公開の言葉だけを渡す", async () => {
    const { client, requests } = recording(JSON.stringify({ family: "cloud", reason: "合いそう" }));
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, scope, created_at) VALUES ('self-1', 'study', 'noda', 'effort', '自分だけの秘密', 'self', ?)").run(NOW.toISOString());
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('open-1', 'study', 'noda', 'effort', 'みんなへの言葉', ?)").run(NOW.toISOString());
    await openGiftEgg(client, db, createDummyTeams(db), "noda", giveEgg("noda"), NOW);
    const sent = requests[0].messages[0].content;
    expect(sent).toContain("みんなへの言葉");
    expect(sent).not.toContain("自分だけの秘密");
  });
});
