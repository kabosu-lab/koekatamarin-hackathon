import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { handleDraft, handlePublish, handleReview, handleUndo } from "./compose-request";
import { openDatabase } from "./db";
import { createDummyTeams } from "./destination/dummy-teams";
import { handleGoals } from "./goals";
import { handleRibbon, listNewRibbons, listPublicRibbons, listRibbons, listTrophyShelves, syncRibbons } from "./ribbons";
import { seedDatabase } from "./seed";
import { TROPHIES } from "./trophies";
import { noteAskSuggested, noteFoundKnowledge, noteWalkFinished } from "./trophy-log";
import { affiliationOf, TROPHY_RULES } from "./trophy-rules";
import type { ClaudeClient } from "./claude/types";

const NOW = new Date("2026-11-04T03:00:00Z");
let db: DatabaseSync;
let serial = 0;

const day = (date: string, hour = "12:00") => new Date(`${date}T${hour}:00+09:00`).toISOString();

function person(id: string, label = "国語", role = "teacher") {
  db.prepare("INSERT INTO people (id, name, role, label, public_profile) VALUES (?, ?, ?, ?, '')").run(id, `${id}名`, role, label);
}

function post(author: string, at: string, options: { kind?: string; channel?: string; scope?: string; asked?: string; body?: string } = {}) {
  const id = `t-post-${(serial += 1)}`;
  db.prepare(
    "INSERT INTO posts (id, channel_id, author_id, kind, body, created_at, scope, asked_person_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, options.channel ?? "study", author, options.kind ?? "trouble", options.body ?? "本文", at, options.scope ?? "everyone", options.asked ?? null);
  return id;
}

function reply(postId: string, author: string, at: string) {
  db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, '返事', ?)").run(`t-reply-${(serial += 1)}`, postId, author, at);
}

function pass(postId: string, from: string, to: string, at: string) {
  db.prepare("INSERT INTO post_passes (id, post_id, from_person_id, to_person_id, created_at) VALUES (?, ?, ?, ?, ?)").run(`t-pass-${(serial += 1)}`, postId, from, to, at);
  db.prepare("UPDATE posts SET asked_person_id = ? WHERE id = ?").run(to, postId);
}

function thanks(from: string, to: string, at: string) {
  db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, ?, ?, 'ありがとう', ?)").run(`t-thanks-${(serial += 1)}`, from, to, at);
}

function knowledge(contributors: string[], options: { topic?: string; at?: string; sourcePost?: string } = {}) {
  const id = `t-item-${(serial += 1)}`;
  const at = options.at ?? day("2026-10-01");
  db.prepare(
    "INSERT INTO knowledge_items (id, source_post_id, title, body, status, author_id, created_at, updated_at, topic) VALUES (?, ?, '題', '本文', 'shared', ?, ?, ?, ?)",
  ).run(id, options.sourcePost ?? post(contributors[0], at), contributors[0], at, at, options.topic ?? "general");
  for (const contributor of contributors) db.prepare("INSERT INTO knowledge_contributors (item_id, person_id, state) VALUES (?, ?, 'ok')").run(id, contributor);
  return id;
}

function like(itemId: string, reviewer: string, at = day("2026-10-20")) {
  db.prepare("INSERT INTO knowledge_reviews (id, item_id, reviewer_id, verdict, comment, created_at) VALUES (?, ?, ?, 'like', '', ?)").run(`t-like-${(serial += 1)}`, itemId, reviewer, at);
}

const earned = (id: string, now = NOW) => {
  syncRibbons(db, id, now);
  return listRibbons(db, id).map((trophy) => trophy.id);
};

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
  for (const id of ["a", "b", "c", "d"]) person(id);
});

describe("一覧", () => {
  it("すべてのトロフィーに判定があり、判定だけのものもない", () => {
    expect(TROPHIES.map((trophy) => trophy.id).sort()).toEqual(Object.keys(TROPHY_RULES).sort());
  });

  it("ID は重ならない", () => {
    expect(new Set(TROPHIES.map((trophy) => trophy.id)).size).toBe(TROPHIES.length);
  });

  it("仕様の実績がすべてある", () => {
    const names = TROPHIES.map((trophy) => trophy.name);
    for (const name of [
      "最初の一歩", "救世主", "恩返し", "頼れる背中", "キラーパス", "名アシスト", "橋をかける人", "リレーの走者",
      "言葉の種", "伝説の一言", "時を超える言葉", "名脇役", "ナイス失敗", "素直な達人", "頼る勇気", "三人寄れば", "満開の立役者", "同じ机の仲間",
      "有言実行", "逃げなかった人", "帰ってきた人", "職員室の生き字引", "コピー機の主", "出張報告の錬金術師", "会議より早い", "伝説の黒板消し",
      "ありがとう長者", "歩く検索エンジン", "パスの魔術師", "名もなき英雄", "パートナーのほうが緊張した", "聞き上手のパートナー", "歩く独り言", "AI より人",
      "ブーメラン", "師弟", "同じ悩み", "先生も生徒", "四季の人", "取り消しの美学", "言い直しの勇者", "桜の木の下で", "一周まわって",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("連続、順位、夜遅くをほめる言葉を使わない", () => {
    expect(JSON.stringify(TROPHIES)).not.toMatch(/連続|ランキング|順位|深夜|徹夜|夜更かし|毎日/);
  });
});

describe("人を助ける", () => {
  it("救世主は、いちばん最初に答えた人だけ", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "b", day("2026-10-01", "13:00"));
    reply(id, "c", day("2026-10-01", "14:00"));
    expect(earned("b")).toContain("first-responder");
    expect(earned("c")).not.toContain("first-responder");
  });

  it("救世主に、投稿した本人の追記は数えない", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "a", day("2026-10-01", "13:00"));
    reply(id, "b", day("2026-10-01", "14:00"));
    expect(earned("b")).toContain("first-responder");
  });

  it("恩返しは、助けてもらったあとに助けたときだけ", () => {
    const mine = post("a", day("2026-10-01"));
    reply(mine, "b", day("2026-10-02"));
    const theirs = post("b", day("2026-10-03"));
    reply(theirs, "a", day("2026-10-04"));
    expect(earned("a")).toContain("repay");
    expect(earned("b")).not.toContain("repay");
  });

  it("頼れる背中は、同じ人から2回目のときだけ", () => {
    post("a", day("2026-10-01"), { asked: "b" });
    expect(earned("b")).not.toContain("trusted");
    post("a", day("2026-10-02"), { asked: "b" });
    expect(earned("b")).toContain("trusted");
    post("c", day("2026-10-01"), { asked: "d" });
    post("a", day("2026-10-02"), { asked: "d" });
    expect(earned("d")).not.toContain("trusted");
  });
});

describe("つなぐ", () => {
  it("名アシストは、パスした先の人に相談した人からありがとうが届いたとき。誰からかは書かない", () => {
    const id = post("a", day("2026-10-01"), { asked: "b" });
    pass(id, "b", "c", day("2026-10-02"));
    reply(id, "c", day("2026-10-03"));
    expect(earned("b")).not.toContain("assist");
    thanks("a", "c", day("2026-10-04"));
    expect(earned("b")).toContain("assist");
    expect(listRibbons(db, "b").find((trophy) => trophy.id === "assist")?.story).not.toMatch(/a名|c名/);
  });

  it("学年と部活は肩書きから読む", () => {
    expect(affiliationOf("3年・ものづくり部")).toEqual({ grade: "3年", club: "ものづくり部" });
    expect(affiliationOf("情報・ものづくり部顧問")).toEqual({ grade: null, club: "ものづくり部" });
    expect(affiliationOf("教頭")).toEqual({ grade: null, club: null });
  });

  it("橋をかける人は、別の学年や部活の投稿への返事。同じ学年や不明では取れない", () => {
    person("g1", "1年・吹奏楽部", "student");
    person("g2", "2年", "student");
    person("g1b", "1年", "student");
    reply(post("g2", day("2026-10-01"), { kind: "effort" }), "g1", day("2026-10-02"));
    expect(earned("g1")).toContain("bridge");
    reply(post("g1", day("2026-10-01"), { kind: "effort" }), "g1b", day("2026-10-02"));
    expect(earned("g1b")).not.toContain("bridge");
    reply(post("g1", day("2026-10-01"), { kind: "effort" }), "a", day("2026-10-02"));
    expect(earned("a")).not.toContain("bridge");
  });

  it("リレーの走者は、3人をまたいで解決したとき関わった全員に届く", () => {
    const id = post("a", day("2026-10-01"), { asked: "b" });
    pass(id, "b", "c", day("2026-10-02"));
    pass(id, "c", "d", day("2026-10-03"));
    expect(earned("d")).not.toContain("relay");
    reply(id, "d", day("2026-10-04"));
    for (const member of ["a", "b", "c", "d"]) expect(earned(member)).toContain("relay");
  });

  it("2人しかまたいでいなければ、リレーではない", () => {
    const id = post("a", day("2026-10-01"), { asked: "b" });
    pass(id, "b", "c", day("2026-10-02"));
    reply(id, "c", day("2026-10-04"));
    expect(earned("c")).not.toContain("relay");
  });
});

describe("言葉が残る", () => {
  it("言葉の種は、確認中や断った知恵では届かない", () => {
    const item = knowledge(["a", "b"]);
    db.prepare("UPDATE knowledge_contributors SET state = 'removed' WHERE person_id = 'b'").run();
    db.prepare("UPDATE knowledge_items SET status = 'confirming' WHERE id = ?").run(item);
    expect(earned("a")).not.toContain("seed-words");
    db.prepare("UPDATE knowledge_items SET status = 'shared' WHERE id = ?").run(item);
    expect(earned("a")).toContain("seed-words");
    expect(earned("b")).not.toContain("seed-words");
  });

  it("伝説の一言は、1つの知恵に別の3人から", () => {
    const item = knowledge(["a"]);
    like(item, "b");
    like(item, "c");
    expect(earned("a")).not.toContain("legend");
    like(item, "d");
    expect(earned("a")).toContain("legend");
  });

  it("時を超える言葉は、半年以上あとのいいね", () => {
    const item = knowledge(["a"], { at: day("2026-01-01") });
    like(item, "b", day("2026-03-01"));
    expect(earned("a")).not.toContain("timeless");
    like(item, "c", day("2026-08-01"));
    expect(earned("a")).toContain("timeless");
  });
});

describe("種類で判定する（本文を読まない）", () => {
  it("ナイス失敗と伝説の黒板消しは、本人が選んだ種類で届く", () => {
    knowledge(["a"], { topic: "failure" });
    knowledge(["b"], { topic: "tidy" });
    knowledge(["c"], { sourcePost: post("c", day("2026-10-01"), { body: "うまくいかなかった。掃除も失敗した" }) });
    expect(earned("a")).toContain("nice-fail");
    expect(earned("b")).toContain("chalkboard-legend");
    expect(earned("c")).not.toContain("nice-fail");
    expect(earned("c")).not.toContain("chalkboard-legend");
  });

  it("生き字引は手順の知恵だけ", () => {
    const procedure = knowledge(["a"], { topic: "procedure" });
    const other = knowledge(["b"]);
    for (const reviewer of ["c", "d", "saeki"]) {
      like(procedure, reviewer);
      like(other, reviewer);
    }
    expect(earned("a")).toContain("walking-archive");
    expect(earned("b")).not.toContain("walking-archive");
  });

  it("コピー機の主は、機械のチャネルの相談への答え", () => {
    reply(post("a", day("2026-10-01"), { channel: "making" }), "b", day("2026-10-02"));
    reply(post("a", day("2026-10-01"), { channel: "study" }), "c", day("2026-10-02"));
    expect(earned("b")).toContain("copier-master");
    expect(earned("c")).not.toContain("copier-master");
  });

  it("歩く検索エンジンは、3つのチャネルで答えたとき", () => {
    reply(post("a", day("2026-10-01"), { channel: "study" }), "b", day("2026-10-02"));
    reply(post("a", day("2026-10-01"), { channel: "making" }), "b", day("2026-10-02"));
    expect(earned("b")).not.toContain("walking-search");
    reply(post("a", day("2026-10-01"), { channel: "clubs" }), "b", day("2026-10-02"));
    expect(earned("b")).toContain("walking-search");
  });
});

describe("みんなで取る", () => {
  it("三人寄ればは、関わった全員に届く", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "b", day("2026-10-02"));
    reply(id, "c", day("2026-10-02"));
    expect(earned("b")).not.toContain("three-heads");
    reply(id, "d", day("2026-10-02"));
    for (const member of ["a", "b", "c", "d"]) expect(earned(member)).toContain("three-heads");
  });

  it("満開の立役者は、満開になった年に葉を増やした人", () => {
    for (let index = 0; index < 60; index += 1) post("a", day("2026-10-01"));
    expect(earned("a")).toContain("full-bloom");
    expect(earned("b")).not.toContain("full-bloom");
  });

  it("同じ机の仲間は、同じ時間に最後まで続けた人どうし。デモのダミーは数えない", () => {
    const session = (id: string, personId: string, isDemo = 0, completed = 1) =>
      db
        .prepare("INSERT INTO study_sessions (id, person_id, started_at, ends_at, finished_at, completed, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, personId, day("2026-10-01", "10:00"), day("2026-10-01", "10:25"), day("2026-10-01", "10:25"), completed, isDemo);
    session("s1", "a");
    session("s2", "c", 1);
    session("s3", "d", 0, 0);
    expect(earned("a")).not.toContain("same-desk");
    session("s4", "b");
    expect(earned("a")).toContain("same-desk");
    expect(listRibbons(db, "a").find((trophy) => trophy.id === "same-desk")?.story).not.toContain("b名");
  });
});

describe("頑張りをたたえる", () => {
  it("逃げなかった人は、止まっていた頑張りたいことに触れたときだけ", () => {
    db.prepare("INSERT INTO goals (id, person_id, text, status, created_at, updated_at) VALUES ('g1', 'a', '動画', 'active', ?, ?)").run(day("2026-09-01"), day("2026-09-01"));
    handleGoals(db, "a", { action: "edit", id: "g1", text: "動画を見る" }, new Date(day("2026-09-03")));
    expect(earned("a")).not.toContain("no-running");
    handleGoals(db, "a", { action: "done", id: "g1" }, new Date(day("2026-10-01")));
    expect(earned("a")).toContain("no-running");
  });

  it("帰ってきた人は、間が空いたあとの返事", () => {
    const id = post("a", day("2026-07-01"));
    reply(id, "b", day("2026-07-02"));
    reply(id, "b", day("2026-07-20"));
    expect(earned("b")).not.toContain("returned");
    reply(id, "b", day("2026-10-01"));
    expect(earned("b")).toContain("returned");
  });
});

describe("ユーモア", () => {
  it("会議より早いは、遅い時間の答えをほめない", () => {
    reply(post("a", day("2026-10-01", "09:00")), "b", day("2026-10-01", "23:30"));
    expect(earned("b")).not.toContain("faster-than-meeting");
    reply(post("a", day("2026-10-02", "09:00")), "b", day("2026-10-03", "10:00"));
    expect(earned("b")).not.toContain("faster-than-meeting");
    reply(post("a", day("2026-10-04", "09:00")), "b", day("2026-10-04", "15:00"));
    expect(earned("b")).toContain("faster-than-meeting");
    expect(earned("a")).toContain("faster-than-meeting");
  });

  it("ありがとう長者は、同じ人からの回数では取れない", () => {
    for (let index = 0; index < 12; index += 1) thanks("b", "a", day("2026-10-01"));
    expect(earned("a")).not.toContain("thanks-millionaire");
    for (let index = 0; index < 10; index += 1) {
      person(`f${index}`);
      thanks(`f${index}`, "a", day("2026-10-01"));
    }
    expect(earned("a")).toContain("thanks-millionaire");
  });

  it("パートナーのほうが緊張したは、自分だけの投稿では取れない", () => {
    post("a", day("2026-10-01"), { scope: "self" });
    expect(earned("a")).not.toContain("first-post");
    post("a", day("2026-10-02"));
    expect(earned("a")).toContain("first-post");
  });
});

describe("隠しトロフィー", () => {
  it("師弟は、助けた人が別の人を助けたとき", () => {
    reply(post("b", day("2026-10-01")), "a", day("2026-10-02"));
    reply(post("a", day("2026-10-03")), "b", day("2026-10-04"));
    expect(earned("a")).not.toContain("mentor");
    reply(post("c", day("2026-10-05")), "b", day("2026-10-06"));
    expect(earned("a")).toContain("mentor");
  });

  it("同じ悩みは、公開の投稿の言葉が重なる2人をつないだとき", () => {
    post("c", day("2026-10-01"), { body: "プリンターの反りで困っています" });
    const id = post("a", day("2026-10-02"), { body: "プリンターの反りが直りません", asked: "b" });
    pass(id, "b", "c", day("2026-10-03"));
    expect(earned("b")).toContain("same-worry");
  });

  it("範囲を絞った投稿では、同じ悩みにならない", () => {
    post("c", day("2026-10-01"), { body: "プリンターの反りで困っています", scope: "self" });
    const id = post("a", day("2026-10-02"), { body: "プリンターの反りが直りません", asked: "b" });
    pass(id, "b", "c", day("2026-10-03"));
    expect(earned("b")).not.toContain("same-worry");
  });

  it("先生も生徒は、生徒と先生の両方に届く。先生どうしでは届かない", () => {
    person("s", "2年", "student");
    like(knowledge(["s"]), "a");
    expect(earned("s")).toContain("both-ways");
    expect(earned("a")).toContain("both-ways");
    like(knowledge(["b"]), "c");
    expect(earned("b")).not.toContain("both-ways");
  });

  it("四季の人は、春夏秋冬がそろったとき", () => {
    for (const date of ["2026-04-10", "2026-07-10", "2026-10-10"]) reply(post("a", day(date)), "b", day(date));
    expect(earned("b")).not.toContain("four-seasons");
    reply(post("a", day("2026-01-10")), "b", day("2026-01-10"));
    expect(earned("b")).toContain("four-seasons");
  });

  it("桜の木の下では、開花の日の投稿", () => {
    post("a", day("2026-04-02"));
    expect(earned("a")).not.toContain("under-sakura");
    post("a", day("2026-04-01"));
    expect(earned("a")).toContain("under-sakura");
  });

  it("ブーメランと一周まわっては、探して開いた昔の自分の言葉", () => {
    const source = post("a", day("2026-01-01"));
    reply(source, "b", day("2026-01-02"));
    const item = knowledge(["a", "b"], { at: day("2026-01-03"), sourcePost: source });
    noteFoundKnowledge(db, "c", item, NOW);
    expect(earned("c")).not.toContain("boomerang");
    noteFoundKnowledge(db, "a", item, NOW);
    noteFoundKnowledge(db, "b", item, NOW);
    expect(earned("a")).toContain("boomerang");
    expect(earned("a")).not.toContain("one-more-lap");
    expect(earned("b")).toContain("one-more-lap");
    expect(earned("b")).not.toContain("boomerang");
  });

  it("作ったばかりの知恵を開いても、昔の自分にはならない", () => {
    const item = knowledge(["a"], { at: day("2026-11-01") });
    noteFoundKnowledge(db, "a", item, NOW);
    expect(earned("a")).not.toContain("boomerang");
  });
});

describe("操作の記録", () => {
  const review = { verdict: "caution", perception: "きつく読めそう", alternatives: ["やわらかい言い方"] };
  const okReview = { verdict: "ok", perception: "よさそう", alternatives: [] };
  const claudeWith = (...texts: string[]): ClaudeClient =>
    ({ mode: "scripted", complete: async () => ({ text: texts.shift() ?? JSON.stringify(okReview), refused: false }) }) as unknown as ClaudeClient;
  const publish = (input: Record<string, unknown>, id = "a") =>
    handlePublish(claudeWith(JSON.stringify(okReview)), createDummyTeams(db), id, { channelId: "study", text: "本文", ...input }, db);

  it("言い直しの勇者は、提案のとおりに送ったときだけ。案の控えは残さない", async () => {
    await handleReview(claudeWith(JSON.stringify(review)), { text: "もとの言い方" }, db, "a");
    await publish({ text: "自分で書き直した" });
    expect(earned("a")).not.toContain("rephrase-hero");

    await handleReview(claudeWith(JSON.stringify(review)), { text: "もとの言い方" }, db, "a");
    await publish({ text: "やわらかい言い方" });
    expect(earned("a")).toContain("rephrase-hero");
    expect(db.prepare("SELECT count(*) AS n FROM trophy_log WHERE kind = 'alternative-offered'").get()).toEqual({ n: 0 });
  });

  it("取り消しの美学は、取り消して送り直したとき", async () => {
    const sent = await publish({});
    expect(sent.status).toBe(200);
    expect(earned("a")).not.toContain("undo-art");
    const postId = (sent.body as { postId: string }).postId;
    expect(handleUndo(createDummyTeams(db), "a", { postId }, new Date(), db).status).toBe(200);
    expect(earned("a")).not.toContain("undo-art");
    await publish({ text: "直した本文" });
    expect(earned("a")).toContain("undo-art");
  });

  it("聞き上手のパートナーは、下書きができず聞き返されたあとに投稿したとき", async () => {
    const notReady = JSON.stringify({ ready: false, text: "", channelId: "study", kind: "report", researchedWithAi: false });
    const outcome = await handleDraft(claudeWith(notReady), createDummyTeams(db), "a", { history: [{ role: "user", content: "うーん" }] }, db);
    expect(outcome.status).toBe(200);
    expect(earned("a")).not.toContain("good-listener");
    await publish({});
    expect(earned("a")).toContain("good-listener");
  });

  it("話の中身を記録しない", async () => {
    const secret = "だれにも言っていない話";
    const notReady = JSON.stringify({ ready: false, text: "", channelId: "study", kind: "report", researchedWithAi: false });
    await handleDraft(claudeWith(notReady), createDummyTeams(db), "a", { history: [{ role: "user", content: secret }] }, db);
    expect(JSON.stringify(db.prepare("SELECT * FROM trophy_log").all())).not.toContain(secret);
  });

  it("歩く独り言は、歩きながら話したあとの投稿", async () => {
    await publish({});
    expect(earned("a")).not.toContain("walk-talk");
    noteWalkFinished(db, "a", new Date());
    await publish({});
    expect(earned("a")).toContain("walk-talk");
  });

  it("AI より人は、案内された相手に本当に送ったときだけ", async () => {
    noteAskSuggested(db, "a", ["b"], new Date());
    await publish({});
    await publish({ askedPersonId: "c" });
    expect(earned("a")).not.toContain("ai-vs-human");
    await publish({ askedPersonId: "b" });
    expect(earned("a")).toContain("ai-vs-human");
  });

  it("時間が空いたら、前の操作と結びつけない", () => {
    noteWalkFinished(db, "a", new Date(Date.now() - 2 * 60 * 60 * 1000));
    return publish({}).then(() => expect(earned("a")).not.toContain("walk-talk"));
  });
});

describe("立場で解ける隠しトロフィー", () => {
  const STANCE = ["nurse-word", "grade-head-eyes", "homeroom-reply", "principal-office", "guidance-cheer", "rare-word"];

  function likePost(postId: string, who: string) {
    db.prepare("INSERT INTO post_likes (post_id, person_id) VALUES (?, ?)").run(postId, who);
  }

  /** やり取りの多い人にする（めずらしい一言にならない） */
  function busy(who: string, before: string) {
    for (let index = 0; index < 4; index += 1) post(who, new Date(Date.parse(before) - (index + 1) * 86_400_000).toISOString(), { kind: "effort" });
  }

  beforeEach(() => {
    person("s", "2年", "student");
    person("nurse", "養護教諭");
    person("head", "数学・学年主任");
    person("home", "国語・2年担任");
    person("sub", "理科・2年副担任");
    person("boss", "校長", "admin");
    person("guide", "体育・生徒指導主事");
    db.prepare("UPDATE people SET homeroom_teacher_id = 'home' WHERE id = 's'").run();
  });

  it("すべて隠しで、取るまで条件を見せない", () => {
    for (const id of STANCE) expect(TROPHIES.find((trophy) => trophy.id === id)?.hidden).toBe(true);
  });

  it("保健室からの一言は、養護の先生から自分の投稿へ返事が届いたとき", () => {
    const id = post("s", day("2026-10-01"));
    busy("nurse", day("2026-10-02"));
    expect(earned("s")).not.toContain("nurse-word");
    reply(id, "nurse", day("2026-10-02"));
    expect(earned("s")).toContain("nurse-word");
    expect(listRibbons(db, "s").find((trophy) => trophy.id === "nurse-word")?.story).not.toContain("nurse名");
  });

  it("人の投稿へ養護の先生が返事をしても、自分は取らない", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "s", day("2026-10-02"));
    reply(id, "nurse", day("2026-10-03"));
    expect(earned("s")).not.toContain("nurse-word");
  });

  it("学年主任のまなざしは、学年主任からのいいね", () => {
    const id = post("s", day("2026-10-01"));
    reply(id, "head", day("2026-10-02"));
    expect(earned("s")).not.toContain("grade-head-eyes");
    likePost(id, "head");
    expect(earned("s")).toContain("grade-head-eyes");
  });

  it("担任からの返事は、生徒なら自分の担任から。副担任や別の担任は数えない", () => {
    const id = post("s", day("2026-10-01"));
    reply(id, "sub", day("2026-10-02"));
    person("other", "英語・3年担任");
    reply(id, "other", day("2026-10-03"));
    expect(earned("s")).not.toContain("homeroom-reply");
    reply(id, "home", day("2026-10-04"));
    expect(earned("s")).toContain("homeroom-reply");
  });

  it("担任の決まっていない人は、肩書きの「担任」で読む", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "sub", day("2026-10-02"));
    expect(earned("a")).not.toContain("homeroom-reply");
    reply(id, "home", day("2026-10-03"));
    expect(earned("a")).toContain("homeroom-reply");
  });

  it("校長室に届いたは、管理職からの返事かいいね。先生にもある", () => {
    const mine = post("a", day("2026-10-01"));
    likePost(mine, "boss");
    expect(earned("a")).toContain("principal-office");
    const theirs = post("s", day("2026-10-01"));
    reply(theirs, "boss", day("2026-10-02"));
    expect(earned("s")).toContain("principal-office");
  });

  it("教頭も管理職に数える", () => {
    const id = post("s", day("2026-10-01"));
    reply(id, "fujimoto", day("2026-10-02"));
    expect(earned("s")).toContain("principal-office");
  });

  it("生徒指導からのエールは、肩書きに生徒指導がある人からの返事かいいね", () => {
    const id = post("s", day("2026-10-01"));
    expect(earned("s")).not.toContain("guidance-cheer");
    likePost(id, "guide");
    expect(earned("s")).toContain("guidance-cheer");
  });

  it("ダミーの先生の肩書きから、養護・学年主任・担任・管理職が読める", () => {
    const id = post("aoki", day("2026-10-30"));
    for (const who of ["shiraishi", "saeki", "fujimoto"]) reply(id, who, day("2026-10-31"));
    likePost(id, "ogawara");
    const trophies = earned("aoki");
    for (const trophy of ["nurse-word", "homeroom-reply", "principal-office", "grade-head-eyes"]) expect(trophies).toContain(trophy);
  });

  it("めずらしい一言は、直近30日のやり取りが少ない人からの返事。誰からかもいつかも書かない", () => {
    const id = post("s", day("2026-10-10"));
    busy("c", day("2026-10-11"));
    reply(id, "c", day("2026-10-11"));
    expect(earned("s")).not.toContain("rare-word");
    // 30日より前のやり取りは数えない
    for (let index = 0; index < 5; index += 1) post("d", day("2026-08-01"), { kind: "effort" });
    reply(id, "d", day("2026-10-12"));
    expect(earned("s")).toContain("rare-word");
    const trophy = listRibbons(db, "s").find((item) => item.id === "rare-word");
    expect(trophy?.story).toBe("めずらしい一言が届いた");
    expect(trophy?.description).toBe("めずらしい一言が届いた");
    expect(trophy?.selfOnly).toBe(true);
  });

  it("Teams から取り込んだ返事も数える（同じ表に入る）", async () => {
    const id = post("s", day("2026-10-01"));
    db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES ('teams-reply-1', ?, 'nurse', 'Teams から', ?)").run(id, day("2026-10-02"));
    expect(earned("s")).toContain("nurse-word");
  });

  it("1つにつき1回だけ。2回目の返事で新しく届かない", () => {
    const id = post("s", day("2026-10-01"));
    reply(id, "nurse", day("2026-10-02"));
    syncRibbons(db, "s", NOW);
    handleRibbon(db, "s", { action: "seen" }, NOW);
    reply(id, "nurse", day("2026-10-03"));
    syncRibbons(db, "s", NOW);
    expect(listNewRibbons(db, "s").map((trophy) => trophy.id)).not.toContain("nurse-word");
    expect(listRibbons(db, "s").filter((trophy) => trophy.id === "nurse-word")).toHaveLength(1);
  });

  it("新しく届いたものは、生徒には「実績解除」、先生には丁寧な形で出せるよう印を付ける", () => {
    const mine = post("s", day("2026-10-01"));
    reply(mine, "nurse", day("2026-10-02"));
    syncRibbons(db, "s", NOW);
    expect(listNewRibbons(db, "s").every((trophy) => !trophy.polite)).toBe(true);
    const theirs = post("a", day("2026-10-01"));
    reply(theirs, "boss", day("2026-10-02"));
    syncRibbons(db, "a", NOW);
    expect(listNewRibbons(db, "a").every((trophy) => trophy.polite)).toBe(true);
  });
});

describe("守ること", () => {
  const SELF_ONLY = TROPHIES.filter((trophy) => trophy.selfOnly);

  it("回数を条件にするものと、言い換えや取り消しは、プロフィールに出せない", () => {
    expect(SELF_ONLY.map((trophy) => trophy.id).sort()).toEqual(
      ["legend", "pass-wizard", "rare-word", "rephrase-hero", "thanks-millionaire", "trusted", "undo-art", "unsung-hero", "walking-archive", "walking-search"].sort(),
    );
    db.prepare("INSERT INTO person_ribbons (person_id, ribbon_id, earned_at, is_public) VALUES ('a', 'undo-art', ?, 1)").run(NOW.toISOString());
    expect(listPublicRibbons(db, "a")).toEqual([]);
    expect(handleRibbon(db, "a", { action: "public", id: "undo-art", isPublic: true }).status).toBe(400);
    expect(listRibbons(db, "a")[0].isPublic).toBe(false);
  });

  it("取っていない隠しトロフィーは、名前も条件も ID も棚に出ない", () => {
    syncRibbons(db, "a", NOW);
    const shelf = listTrophyShelves(db, "a").find((item) => item.category === "hidden");
    expect(shelf?.slots.every((slot) => slot.state === "secret")).toBe(true);
    const text = JSON.stringify(shelf);
    for (const trophy of TROPHIES.filter((item) => item.hidden)) {
      expect(text).not.toContain(trophy.id);
      expect(text).not.toContain(trophy.name);
      expect(text).not.toContain(trophy.description);
    }
  });

  it("取った隠しトロフィーは棚で見えるが、人のプロフィールでは条件を書かない", () => {
    post("a", day("2026-04-01"));
    syncRibbons(db, "a", NOW);
    const hidden = listTrophyShelves(db, "a").find((item) => item.category === "hidden");
    expect(hidden?.slots.some((slot) => slot.state === "earned" && slot.trophy.name === "桜の木の下で")).toBe(true);
    handleRibbon(db, "a", { action: "public", id: "under-sakura", isPublic: true }, NOW);
    expect(listPublicRibbons(db, "a").find((trophy) => trophy.id === "under-sakura")?.description).toBe("隠しトロフィー");
  });

  it("棚に数や割合を渡さない", () => {
    syncRibbons(db, "a", NOW);
    for (const shelf of listTrophyShelves(db, "a")) expect(Object.keys(shelf).sort()).toEqual(["category", "complete", "label", "slots"]);
  });

  it("一度もらったら、元の行動が消えても減らない", () => {
    const id = post("a", day("2026-10-01"));
    reply(id, "b", day("2026-10-02"));
    expect(earned("b")).toContain("first-responder");
    db.prepare("DELETE FROM replies WHERE post_id = ?").run(id);
    expect(earned("b")).toContain("first-responder");
  });

  it("新しく届いたものは、瞬間の演出に一度だけ渡す", () => {
    post("a", day("2026-10-01"));
    syncRibbons(db, "a", NOW);
    expect(listNewRibbons(db, "a").map((trophy) => trophy.id)).toContain("first-post");
    handleRibbon(db, "a", { action: "seen" }, NOW);
    syncRibbons(db, "a", NOW);
    expect(listNewRibbons(db, "a")).toEqual([]);
  });

  it("範囲を絞った投稿への返事は、公開の投稿を使う判定に数えない", () => {
    reply(post("a", day("2026-10-01"), { scope: "person" }), "b", day("2026-10-02"));
    const trophies = earned("b");
    for (const id of ["first-responder", "bridge", "walking-search", "faster-than-meeting"]) expect(trophies).not.toContain(id);
  });

  it("画面の部品は、一覧を型だけ読み込む（隠しトロフィーの条件が配られない）", () => {
    for (const path of ["src/app/Sticker.tsx", "src/app/me/Ribbons.tsx", "src/app/RibbonMoment.tsx", "src/app/TrophyToast.tsx"]) {
      const source = readFileSync(path, "utf8");
      for (const line of source.split("\n").filter((text) => /@\/lib\/(trophies|trophy-rules|ribbons)"/.test(text))) expect(line).toMatch(/^import type /);
    }
  });
});
