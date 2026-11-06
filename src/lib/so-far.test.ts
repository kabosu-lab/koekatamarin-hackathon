import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db";
import { seedDatabase } from "./seed";
import { getSoFar } from "./so-far";

const NOW = new Date("2026-11-04T09:00:00Z");
let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

function addPerson(id: string, role: "teacher" | "student") {
  db.prepare("INSERT INTO people (id, name, role, label, public_profile) VALUES (?, ?, ?, '', '')").run(id, `${id} さん`, role);
}

describe("これまでのインフォグラフィックの材料", () => {
  it("やり取りした相手が並び、隠している人は線にも一言にも出ない", () => {
    const before = getSoFar(db, "saeki", NOW);
    expect(before.people.length).toBeGreaterThan(0);
    const someone = before.people[0];
    db.prepare("INSERT INTO hidden_people (person_id, hidden_person_id, created_at) VALUES ('saeki', ?, 't')").run(someone.id);
    db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES ('t-hidden', ?, 'saeki', '隠した人の一言', ?)").run(
      someone.id,
      NOW.toISOString(),
    );
    const after = getSoFar(db, "saeki", NOW);
    expect(after.people.map((p) => p.id)).not.toContain(someone.id);
    expect(after.words.map((w) => w.text)).not.toContain("隠した人の一言");
  });

  it("応援（post_likes）は時刻がないので、届いた日の点に入れない", () => {
    addPerson("likes-only", "teacher");
    db.prepare("INSERT INTO post_likes (post_id, person_id) SELECT id, 'likes-only' FROM posts LIMIT 3").run();
    const story = getSoFar(db, "likes-only", NOW);
    expect(story.counts.cheers).toBe(3);
    expect(story.reachedDays).toEqual([]);
  });

  it("投稿・日報・返信・ありがとうがすべて 0 の人は empty になる", () => {
    addPerson("newcomer", "student");
    const story = getSoFar(db, "newcomer", NOW);
    expect(story.empty).toBe(true);
    expect(story.few).toBe(true);
    expect(story.firstDate).toBeNull();
    expect(story.people).toEqual([]);
    expect(story.words).toEqual([]);
  });

  it("先生は勉強の日を持たず、生徒は一緒に勉強した日を持つ", () => {
    const insert = db.prepare(
      "INSERT INTO study_sessions (id, person_id, started_at, ends_at, finished_at, completed, is_demo) VALUES (?, ?, ?, ?, ?, 1, 0)",
    );
    insert.run("s-teacher", "saeki", "2026-10-20T08:00:00Z", "2026-10-20T08:25:00Z", "2026-10-20T08:25:00Z");
    insert.run("s-student", "aoki", "2026-10-20T08:00:00Z", "2026-10-20T08:25:00Z", "2026-10-20T08:25:00Z");
    expect(getSoFar(db, "saeki", NOW).studyDays).toEqual([]);
    expect(getSoFar(db, "aoki", NOW).studyDays).toEqual(["2026-10-20"]);
  });

  it("届いた日はこの学期の、日本の日付で、重ならずに並ぶ", () => {
    const story = getSoFar(db, "saeki", NOW);
    expect(story.termStart).toBe("2026-09-01");
    expect(new Set(story.reachedDays).size).toBe(story.reachedDays.length);
    for (const day of story.reachedDays) {
      expect(day >= "2026-09-01" && day <= "2026-11-04").toBe(true);
    }
  });

  it("つながった人は最大8人で、残りは数だけ", () => {
    addPerson("hub", "teacher");
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('hub-post', 'study', 'hub', 'trouble', '困りごと', ?)").run(
      NOW.toISOString(),
    );
    for (let i = 0; i < 10; i++) {
      addPerson(`friend-${i}`, "teacher");
      db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, 'hub-post', ?, '返信', ?)").run(
        `r-${i}`,
        `friend-${i}`,
        NOW.toISOString(),
      );
    }
    const story = getSoFar(db, "hub", NOW);
    expect(story.people).toHaveLength(8);
    expect(story.morePeople).toBe(2);
  });
});
