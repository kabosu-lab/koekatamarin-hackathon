import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { getAvatar } from "./avatar";
import { loadArt, isArtName } from "./art";
import { getPhotoAvatarState, handleAvatarFromPhoto, lumpLookOf, pickWithClaude, renderArt, roomToken } from "./avatar-art";
import { artNameFor, CATALOG, catalogEntry } from "./avatar-catalog";
import { POSES } from "./avatar-draw";
import { createClaude } from "./claude";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyPhotos, drawDrink, drawMug, drawNightCity } from "./profile-photo/dummy";
import type { ProfilePhotoSource } from "./profile-photo/types";
import { seedDatabase } from "./seed";
import { ensureDemoCompanions, getPresence } from "./study";

const NOW = new Date("2026-11-04T03:00:00Z");
const MARKER = "PHOTO-MARKER-THAT-MUST-NOT-BE-STORED";
const photo = new TextEncoder().encode(MARKER.repeat(40));

const TRAITS = { colors: ["#123456", "#abcdef", "#000000"], motif: "カップ", mood: "ほっとする" };

function pickAnswer() {
  return { usable: true, family: "spirit", reason: "夕焼けの色に合う", talent: "ほっと一息", traits: TRAITS };
}

function artDir(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "koekata-art-"));
  for (const name of names) writeFileSync(join(dir, name), name);
  return dir;
}

const emptyDir = () => artDir([]);

function recording(answer: unknown): { client: ClaudeClient; requests: ClaudeRequest[] } {
  const requests: ClaudeRequest[] = [];
  return {
    requests,
    client: {
      mode: "real",
      async complete(request) {
        requests.push(request);
        if (answer instanceof Error) throw answer;
        return { text: JSON.stringify(answer), refused: false };
      },
    },
  };
}

const photos: ProfilePhotoSource = {
  label: "テスト",
  getPhoto: async (id) => (id === "noda" ? null : { mediaType: "image/png", bytes: photo }),
};

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(":memory:");
  seedDatabase(db);
});

describe("写真からパートナーを選ぶ", () => {
  it("写真を DB にもファイルにも残さない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "koekata-photo-"));
    const fileDb = openDatabase(join(dir, "test.db"));
    seedDatabase(fileDb);
    const { client, requests } = recording(pickAnswer());
    const outcome = await handleAvatarFromPhoto(client, fileDb, photos, "saeki", {}, NOW);
    await outcome.done;

    expect(requests).toHaveLength(1);
    expect(requests[0].attachment?.base64).toBe(Buffer.from(photo).toString("base64"));
    const base64 = Buffer.from(photo).toString("base64").slice(0, 60);
    const rows = fileDb.prepare("SELECT * FROM avatar_art WHERE person_id = 'saeki'").all();
    expect(JSON.stringify(rows)).not.toContain(MARKER);
    expect(JSON.stringify(rows)).not.toContain(base64);
    fileDb.close();
    for (const name of readdirSync(dir)) {
      const content = readFileSync(join(dir, name)).toString("latin1");
      expect(content).not.toContain(MARKER);
      expect(content).not.toContain(base64);
    }
    rmSync(dir, { recursive: true });
  });

  it("選んだ絵と、理由と、得意なことが残り、指示は人を特定しないよう求める", async () => {
    const { client, requests } = recording(pickAnswer());
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    expect(getAvatar(db, "saeki")).toMatchObject({ family: "spirit" });
    const state = await getPhotoAvatarState(db, photos, "saeki", NOW);
    expect(state).toMatchObject({ status: "ready", talent: "ほっと一息", reason: "夕焼けの色に合う", canUsePhoto: false });
    expect(requests[0].system).toContain("誰かも推測しません");
    expect(requests[0].system).toContain("顔立ち");
    for (const entry of CATALOG) expect(requests[0].system).toContain(entry.id);
  });

  it("本人以外のパートナーは作れず、Claude も写真も読まない", async () => {
    const { client, requests } = recording(pickAnswer());
    const outcome = await handleAvatarFromPhoto(client, db, photos, "saeki", { personId: "aoki" }, NOW);
    expect(outcome.status).toBe(403);
    expect(requests).toHaveLength(0);
    expect(getAvatar(db, "aoki").image).not.toContain("/api/avatar/");
  });

  it("写真がない人は問いかけへ戻り、何も決まらない", async () => {
    db.prepare("DELETE FROM avatars WHERE person_id = 'noda'").run();
    const { client, requests } = recording(pickAnswer());
    const outcome = await handleAvatarFromPhoto(client, db, photos, "noda", {}, NOW);
    expect(outcome.status).toBe(404);
    expect(requests).toHaveLength(0);
    expect(getAvatar(db, "noda").family).toBeNull();
    expect((await getPhotoAvatarState(db, photos, "noda", NOW)).canUsePhoto).toBe(false);
  });

  it("選んでいる間は待たせず、卵を出し、二度押しで呼び直さない", async () => {
    let finish = (_: unknown) => {};
    const requests: ClaudeRequest[] = [];
    const slow: ClaudeClient = {
      mode: "real",
      complete: (request) => {
        requests.push(request);
        return new Promise((resolve) => {
          finish = () => resolve({ text: JSON.stringify(pickAnswer()), refused: false });
        });
      },
    };
    const first = await handleAvatarFromPhoto(slow, db, photos, "saeki", {}, NOW);
    expect(first.status).toBe(202);
    expect(getAvatar(db, "saeki").image).toContain("/egg");
    expect((await handleAvatarFromPhoto(slow, db, photos, "saeki", {}, NOW)).status).toBe(202);
    expect(requests).toHaveLength(1);

    finish(null);
    await first.done;
    expect(getAvatar(db, "saeki").image).toMatch(/\/api\/avatar\/art\/.+\/normal/);
    expect((await handleAvatarFromPhoto(slow, db, photos, "saeki", {}, NOW)).status).toBe(409);
    expect(requests).toHaveLength(1);
  });

  it.each([
    ["一覧にない絵", { ...pickAnswer(), family: "pikachu" }],
    ["使えないという答え", { ...pickAnswer(), usable: false }],
    ["通信の失敗", new Error("boom")],
  ])("%s のときは、コードで描いた絵に戻り、やり直せる", async (_name, answer) => {
    const { client } = recording(answer);
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    const { image, family } = getAvatar(db, "saeki");
    expect(catalogEntry(family)).toBeNull();
    const art = await renderArt(db, image.split("/")[4], "normal", {}, emptyDir());
    expect(art?.contentType).toBe("image/svg+xml");
    expect(image).toContain("/normal");
    const state = await getPhotoAvatarState(db, photos, "saeki", NOW);
    expect(state.status).toBe("failed");
    expect(state.canUsePhoto).toBe(true);
  });

  it("色の形が違っても、一覧にある絵なら選べて、卵の色はコードで決める", async () => {
    const { client } = recording({ ...pickAnswer(), traits: { colors: ["red"], motif: "", mood: "" } });
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    const { family } = getAvatar(db, "saeki");
    expect(family).toBe("spirit");
    const row = db.prepare("SELECT traits FROM avatar_art WHERE person_id = 'saeki'").get() as { traits: string };
    expect(JSON.parse(row.traits).colors).toHaveLength(3);
  });

  it("断られたときも、コードの絵に戻る", async () => {
    const client: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    expect((await getPhotoAvatarState(db, photos, "saeki", NOW)).status).toBe("failed");
  });

  it("テストと台本モードでは本物を呼ばず、キーがあっても台本で選ぶ", async () => {
    expect(createClaude({ KOEKATA_CLAUDE: "scripted", ANTHROPIC_API_KEY: "x" }).mode).toBe("scripted");
    await (await handleAvatarFromPhoto(createScriptedClaude(), db, createDummyPhotos(), "saeki", {}, NOW)).done;
    const state = await getPhotoAvatarState(db, createDummyPhotos(), "saeki", NOW);
    expect(state).toMatchObject({ status: "ready", source: "claude", canUsePhoto: false });
    expect(getAvatar(db, "saeki").family).toBe("cloud");
  });

  it("ダミーの写真は、本物の PNG で、写真のない人もいる", async () => {
    for (const draw of [drawMug, drawDrink, drawNightCity]) expect(Buffer.from(draw()).subarray(1, 4).toString()).toBe("PNG");
    expect(await createDummyPhotos().getPhoto("noda")).toBeNull();
  });
});

describe("配信する絵", () => {
  async function picked(family = "spirit") {
    const { client } = recording({ ...pickAnswer(), family });
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    return getAvatar(db, "saeki").image.split("/")[4];
  }

  it("パートナーは手元の絵があってもコードで描き、どのポーズでも同じ動物を出す", async () => {
    const token = await picked("bird");
    const dir = artDir(["bird-1.png", "bird-2.png", "bird-3.png"]);
    const art = await renderArt(db, token, "normal", {}, dir);
    expect(art?.contentType).toBe("image/svg+xml");
    for (const pose of POSES) {
      const posed = await renderArt(db, token, pose, {}, dir);
      expect(posed?.body).toBe(art?.body);
      expect(posed?.body).not.toMatch(/<text|<script|png/);
    }
    expect(await renderArt(db, "unknown", "normal", {})).toBeNull();
  });

  it("名前の一覧にない絵は読めない。背景の絵はそのまま読める", async () => {
    expect(isArtName("cloud-3.png")).toBe(true);
    expect(isArtName("bird-hi.png")).toBe(false);
    expect(isArtName("../.env")).toBe(false);
    const background = await loadArt("school-haru.jpg", artDir(["school-haru.jpg"]), { KOEKATA_AVATAR_ART: "code" });
    expect(background?.placeholder).toBe(false);
  });

  it("段階の数は、生き物と雲の子が3、人物が5", () => {
    for (const entry of CATALOG) expect(entry.stages).toBe(entry.group === "human" ? 5 : 3);
    expect(artNameFor("cloud", 9)).toBe("cloud-3.png");
    expect(artNameFor("nothing", 1)).toBeNull();
  });
});

describe("アイコンから選ぶ声のかたまり", () => {
  it("写真を読んで選んだ色と形を窓で使い、作っていなければ既定のまま", async () => {
    expect(lumpLookOf(db, "saeki")).toEqual({});
    const client: ClaudeClient = {
      mode: "real",
      complete: async () => ({ text: JSON.stringify({ ...pickAnswer(), traits: { ...TRAITS, shape: "fluff" } }), refused: false }),
    };
    const pick = await pickWithClaude(client, { attachment: { mediaType: "image/png", data: "" } as never, seed: "s" });
    expect(pick?.traits.shape).toBe("fluff");
    db.prepare("INSERT OR REPLACE INTO avatar_art (person_id, token, room_token, status, stage, updated_at, traits) VALUES ('saeki', 't', 'r', 'ready', 0, 'n', ?)").run(JSON.stringify(pick?.traits));
    expect(lumpLookOf(db, "saeki")).toEqual({ color: "#123456", shape: "fluff" });
  });
});

describe("自習室", () => {
  it("人の名前も ID も出さず、名前の横の絵とは別の印を使う", async () => {
    const { client } = recording(pickAnswer());
    await (await handleAvatarFromPhoto(client, db, photos, "aoki", {}, NOW)).done;
    ensureDemoCompanions(db, NOW);
    const presence = getPresence(db, NOW);
    expect(presence.count).toBeGreaterThan(0);
    expect(presence.tokens).toHaveLength(presence.count);
    const text = JSON.stringify(presence);
    expect(text).not.toMatch(/aoki|nakamura|青木|中村/);
    expect(presence.tokens).not.toContain(getAvatar(db, "aoki").image.split("/")[4]);
    expect(presence.tokens).toContain(roomToken(db, "aoki", NOW));
  });

  it("写真のない人でも、勉強の絵が出る", async () => {
    const art = await renderArt(db, roomToken(db, "noda", NOW), "study", {}, emptyDir());
    expect(art?.body).toContain("<svg");
  });
});
