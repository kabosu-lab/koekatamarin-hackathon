import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { getAvatar } from "./avatar";
import { getPhotoAvatarState, handleAvatarFromPhoto, refreshAvatarArt, renderArt, roomToken } from "./avatar-art";
import { drawWithCode, POSES } from "./avatar-draw";
import { createClaude } from "./claude";
import { createScriptedClaude } from "./claude/scripted";
import type { ClaudeClient, ClaudeRequest } from "./claude/types";
import { openDatabase } from "./db";
import { createDummyPhotos, drawFrappe } from "./profile-photo/dummy";
import type { ProfilePhotoSource } from "./profile-photo/types";
import { seedDatabase } from "./seed";
import { ensureDemoCompanions, getPresence } from "./study";

const NOW = new Date("2026-11-04T03:00:00Z");
const MARKER = "PHOTO-MARKER-THAT-MUST-NOT-BE-STORED";
const photo = new TextEncoder().encode(MARKER.repeat(40));

const TRAITS = { colors: ["#123456", "#abcdef", "#000000"], motif: "カップ", mood: "ほっとする" };

function drawnAnswer(body = `<circle cx="100" cy="100" r="50" fill="#123456"/>`) {
  return {
    usable: true,
    traits: TRAITS,
    body,
    poses: Object.fromEntries(POSES.map((pose) => [pose, `<rect x="1" y="1" width="9" height="9" fill="#abcdef"/>`])),
  };
}

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

describe("写真から分身を作る", () => {
  it("写真を DB にもファイルにも残さない", async () => {
    const dir = mkdtempSync(join(tmpdir(), "koekata-photo-"));
    const fileDb = openDatabase(join(dir, "test.db"));
    seedDatabase(fileDb);
    const { client, requests } = recording(drawnAnswer());
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

  it("本人以外の分身は作れず、Claude も写真も読まない", async () => {
    const { client, requests } = recording(drawnAnswer());
    const outcome = await handleAvatarFromPhoto(client, db, photos, "saeki", { personId: "aoki" }, NOW);
    expect(outcome.status).toBe(403);
    expect(requests).toHaveLength(0);
    expect(getAvatar(db, "aoki").image).not.toContain("/api/avatar/");
  });

  it("写真がない人は問いかけへ戻り、何も決まらない", async () => {
    db.prepare("DELETE FROM avatars WHERE person_id = 'noda'").run();
    const { client, requests } = recording(drawnAnswer());
    const outcome = await handleAvatarFromPhoto(client, db, photos, "noda", {}, NOW);
    expect(outcome.status).toBe(404);
    expect(requests).toHaveLength(0);
    expect(getAvatar(db, "noda").family).toBeNull();
    expect((await getPhotoAvatarState(db, photos, "noda", NOW)).canUsePhoto).toBe(false);
  });

  it("描いている間は待たせず、卵を出し、二度押しで呼び直さない", async () => {
    let finish = (_: unknown) => {};
    const requests: ClaudeRequest[] = [];
    const slow: ClaudeClient = {
      mode: "real",
      complete: (request) => {
        requests.push(request);
        return new Promise((resolve) => {
          finish = () => resolve({ text: JSON.stringify(drawnAnswer()), refused: false });
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
    ["危険な SVG", drawnAnswer(`<script>alert(1)</script>`)],
    ["使えないという答え", { ...drawnAnswer(), usable: false }],
    ["色の形が違う答え", { ...drawnAnswer(), traits: { colors: ["red"], motif: "", mood: "" } }],
    ["通信の失敗", new Error("boom")],
  ])("%s のときは、コードで描いた絵に戻り、やり直せる", async (_name, answer) => {
    const { client } = recording(answer);
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    const { image } = getAvatar(db, "saeki");
    const token = image.split("/")[4];
    const svg = renderArt(db, token, "normal", {});
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("script");
    expect(image).toContain("/normal");
    const state = await getPhotoAvatarState(db, photos, "saeki", NOW);
    expect(state.status).toBe("failed");
    expect(state.canUsePhoto).toBe(true);
  });

  it("断られたときも、コードの絵に戻る", async () => {
    const client: ClaudeClient = { mode: "real", complete: async () => ({ text: "", refused: true }) };
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    expect((await getPhotoAvatarState(db, photos, "saeki", NOW)).status).toBe("failed");
  });

  it("テストと台本モードでは本物を呼ばず、キーがあっても台本で描く", async () => {
    expect(createClaude({ KOEKATA_CLAUDE: "scripted", ANTHROPIC_API_KEY: "x" }).mode).toBe("scripted");
    await (await handleAvatarFromPhoto(createScriptedClaude(), db, createDummyPhotos(), "saeki", {}, NOW)).done;
    const state = await getPhotoAvatarState(db, createDummyPhotos(), "saeki", NOW);
    expect(state).toMatchObject({ status: "ready", source: "claude", canUsePhoto: false });
  });

  it("ダミーの写真は、本物の PNG で、写真のない人もいる", async () => {
    expect(Buffer.from(drawFrappe()).subarray(1, 4).toString()).toBe("PNG");
    expect(await createDummyPhotos().getPhoto("noda")).toBeNull();
  });
});

describe("育ったときの描き直し", () => {
  async function drawn(client: ClaudeClient) {
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
  }
  const growUp = () => {
    const insert = db.prepare("INSERT INTO thanks (id, from_person_id, to_person_id, message, created_at) VALUES (?, 'aoki', 'saeki', 'x', ?)");
    for (let i = 0; i < 30; i++) insert.run(`grow-${i}`, NOW.toISOString());
  };

  it("段階が変わったときだけ呼び、写真は渡さない", async () => {
    const { client, requests } = recording(drawnAnswer());
    await drawn(client);
    await refreshAvatarArt(client, db, "saeki", NOW);
    expect(requests).toHaveLength(1);

    growUp();
    await refreshAvatarArt(client, db, "saeki", NOW);
    expect(requests).toHaveLength(2);
    expect(requests[1].attachment).toBeUndefined();
    await refreshAvatarArt(client, db, "saeki", NOW);
    expect(requests).toHaveLength(2);
  });

  it("描き直せなくても、今の絵のままで、同じ段階では呼び直さない", async () => {
    await drawn(recording(drawnAnswer()).client);
    const before = getAvatar(db, "saeki").image.split("/")[4];
    const failing = recording(new Error("boom"));
    growUp();
    await refreshAvatarArt(failing.client, db, "saeki", NOW);
    await refreshAvatarArt(failing.client, db, "saeki", NOW);
    expect(failing.requests).toHaveLength(1);
    expect(renderArt(db, before, "normal", {})).toContain("#123456");
  });

  it("写真から作っていない人は呼ばない", async () => {
    const { client, requests } = recording(drawnAnswer());
    await refreshAvatarArt(client, db, "aoki", NOW);
    expect(requests).toHaveLength(0);
  });
});

describe("配信する絵", () => {
  it("描いた絵とコードの絵を切り替えられ、どのポーズも文字を含まない", async () => {
    const { client } = recording(drawnAnswer());
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    const token = getAvatar(db, "saeki").image.split("/")[4];
    for (const pose of POSES) {
      expect(renderArt(db, token, pose, {})).toContain("#abcdef");
      expect(renderArt(db, token, pose, {})).not.toMatch(/<text|<script/);
    }
    expect(renderArt(db, token, "normal", { KOEKATA_AVATAR_ART: "code" })).toContain(drawWithCode({ colors: TRAITS.colors as [string, string, string], motif: "", mood: "" }, 1).body.slice(0, 30));
    expect(renderArt(db, "unknown", "normal", {})).toBeNull();
  });

  it("保存された絵が壊されていても、配信のときにもう一度確かめる", async () => {
    const { client } = recording(drawnAnswer());
    await (await handleAvatarFromPhoto(client, db, photos, "saeki", {}, NOW)).done;
    db.prepare("UPDATE avatar_art SET body = '<script>alert(1)</script>' WHERE person_id = 'saeki'").run();
    const token = getAvatar(db, "saeki").image.split("/")[4];
    expect(renderArt(db, token, "normal", {})).not.toContain("script");
  });
});

describe("自習室", () => {
  it("人の名前も ID も出さず、名前の横の絵とは別の印を使う", async () => {
    const { client } = recording(drawnAnswer());
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

  it("写真のない人でも、勉強の絵がコードで描ける", () => {
    expect(renderArt(db, roomToken(db, "noda", NOW), "study", {})).toContain("<svg");
  });
});
