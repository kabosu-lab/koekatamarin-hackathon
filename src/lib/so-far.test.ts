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

  it("つながった人は最大12人で、残りは数だけ", () => {
    addPerson("hub", "teacher");
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES ('hub-post', 'study', 'hub', 'trouble', '困りごと', ?)").run(
      NOW.toISOString(),
    );
    for (let i = 0; i < 14; i++) {
      addPerson(`friend-${i}`, "teacher");
      db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, 'hub-post', ?, '返信', ?)").run(
        `r-${i}`,
        `friend-${i}`,
        NOW.toISOString(),
      );
    }
    const story = getSoFar(db, "hub", NOW);
    expect(story.people).toHaveLength(12);
    expect(story.morePeople).toBe(2);
  });
});

describe("つながりのワードクラウド（0-3h）", () => {
  const at = "2026-11-02T01:00:00Z";
  function post(id: string, author: string, channel: string) {
    db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, ?, ?, 'trouble', 'ダミー', ?)").run(
      id,
      channel,
      author,
      at,
    );
  }
  function reply(id: string, postId: string, author: string) {
    db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, 'ダミー', ?)").run(id, postId, author, at);
  }
  const channel = (audience: "everyone" | "staff") =>
    (db.prepare("SELECT id FROM channels WHERE audience = ? LIMIT 1").get(audience) as { id: string }).id;

  it("人ごとにやり取りの種類と回数を数え、多い人ほど重い", () => {
    addPerson("cloud-me", "teacher");
    addPerson("cloud-a", "teacher");
    addPerson("cloud-b", "teacher");
    post("cp1", "cloud-me", channel("everyone"));
    reply("cr1", "cp1", "cloud-a");
    reply("cr2", "cp1", "cloud-a");
    reply("cr3", "cp1", "cloud-b");
    db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES ('ct1', 'cloud-a', 'cloud-me', 'ダミー', ?)").run(at);
    const story = getSoFar(db, "cloud-me", NOW);
    const a = story.people.find((p) => p.id === "cloud-a")!;
    const b = story.people.find((p) => p.id === "cloud-b")!;
    expect(a.weight).toBe(3);
    expect(a.facts).toEqual([
      { kind: "thanksGot", count: 1 },
      { kind: "repliesGot", count: 2 },
    ]);
    expect(b.weight).toBe(1);
    expect(story.people.indexOf(a)).toBeLessThan(story.people.indexOf(b));
  });

  it("職員室や自分だけ・管理職だけの投稿の上のやり取りは、生徒では数えず、先生では数える", () => {
    addPerson("cloud-me", "teacher");
    addPerson("cloud-staff", "teacher");
    addPerson("cloud-pupil", "student");
    post("cp2", "cloud-me", channel("staff"));
    reply("cr4", "cp2", "cloud-staff");
    expect(getSoFar(db, "cloud-me", NOW).people.map((p) => p.id)).toContain("cloud-staff");
    // 生徒：先生だけのチャネルと、管理職だけの投稿の上のやり取りは数えない
    post("cp4", "cloud-staff", channel("staff"));
    reply("cr6", "cp4", "cloud-pupil");
    post("cp5", "cloud-pupil", channel("everyone"));
    db.prepare("UPDATE posts SET scope = 'managers' WHERE id = 'cp5'").run();
    reply("cr7", "cp5", "cloud-me");
    const ids = getSoFar(db, "cloud-pupil", NOW).people.map((p) => p.id);
    expect(ids).not.toContain("cloud-staff");
    expect(ids).not.toContain("cloud-me");
    // 先生の画面では、管理職だけの投稿の上のやり取りも数える
    expect(getSoFar(db, "cloud-me", NOW).people.map((p) => p.id)).toContain("cloud-pupil");
  });

  it("生徒の画面には、回しただけの先生は出さず、やり取りのあった先生だけを出す", () => {
    addPerson("cloud-student", "student");
    addPerson("cloud-t1", "teacher");
    addPerson("cloud-t2", "teacher");
    post("cp3", "cloud-student", channel("everyone"));
    db.prepare(
      "INSERT INTO post_passes (id, post_id, from_person_id, to_person_id, created_at) VALUES ('cx1', 'cp3', 'cloud-student', 'cloud-t1', ?)",
    ).run(at);
    reply("cr5", "cp3", "cloud-t2");
    const ids = getSoFar(db, "cloud-student", NOW).people.map((p) => p.id);
    expect(ids).toContain("cloud-t2");
    expect(ids).not.toContain("cloud-t1");
  });
});
