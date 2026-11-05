import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { countContributions, getAvatar, PENDING_FAMILY, stageFor, type AvatarView } from "./avatar";
import { CATALOG, catalogEntry, catalogForPrompt } from "./avatar-catalog";
import { companionImage } from "./companion-art";
import type { ClaudeClient } from "./claude/types";

const MAX_TOKENS = 800;
const MAX_REASON = 60;
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 3;

export type EvolutionCandidate = { family: string; name: string; reason: string; image: string };

type Stored = { family: string; reason: string };

const evolveSystemPrompt = `あなたは、校内アプリ「こえかた」で、持ち主の相棒が進化するときの候補を出す係です。下の一覧から2〜3個の系統を選び、なぜ合いそうかを短く伝えます。選ぶのは持ち主です。

- 今の系統を1つ含め、今までと違う方向も1つ以上入れる
- reason は30文字くらいまで。持ち主の性格を決めつけず、人と比べない。点数や順位を書かない
- family は一覧の id だけを使う

一覧:
${catalogForPrompt()}`;

const evolveSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["family", "reason"],
        properties: { family: { type: "string", enum: CATALOG.map((entry) => entry.id) }, reason: { type: "string" } },
      },
    },
  },
};

type Row = { family: string; shown_stage: number | null };

function loadRow(db: DatabaseSync, personId: string): Row | undefined {
  return db.prepare("SELECT family, shown_stage FROM avatars WHERE person_id = ?").get(personId) as Row | undefined;
}

function earned(db: DatabaseSync, personId: string, family: string): number {
  return stageFor(family, countContributions(db, personId));
}

/**
 * 次に進化できる段階。なければ null。本人が選ぶまで、見える姿は変わらない。
 * 一度に1段ずつ進むので、たくさん育った人は、選ぶ楽しみが続く。
 * 前からいる人は今の段階を起点にする（いきなり何段階分も選ばせない）。
 */
export function pendingEvolution(db: DatabaseSync, personId: string): number | null {
  const row = loadRow(db, personId);
  if (!row || row.family === PENDING_FAMILY || !catalogEntry(row.family)) return null;
  const now = earned(db, personId, row.family);
  if (row.shown_stage === null) {
    db.prepare("UPDATE avatars SET shown_stage = ? WHERE person_id = ?").run(now, personId);
    return null;
  }
  return now > row.shown_stage ? row.shown_stage + 1 : null;
}

/** 候補を決まった形で作る。今の系統と、違う方向を2つ。Claude を呼べないときも同じ形で出る。 */
function codeCandidates(personId: string, family: string, stage: number): Stored[] {
  const order = (id: string) => createHash("sha256").update(`${personId}|${stage}|${id}`).digest("hex");
  const tone = catalogEntry(family)?.tone;
  // 最初の色に近い動物を先に出す。最後に選ぶのは本人
  const others = CATALOG.filter((entry) => entry.id !== family).sort(
    (a, b) => Number(b.tone === tone) - Number(a.tone === tone) || order(a.id).localeCompare(order(b.id)),
  );
  const current = catalogEntry(family);
  const different = others.find((entry) => entry.group !== current?.group);
  const picks = [current, others.find((entry) => entry !== different), different].filter((entry) => entry !== null && entry !== undefined);
  return picks.map((entry) => ({ family: entry.id, reason: `${entry.mood.split("、").slice(0, 2).join("、")}の方向へ` }));
}

/** Claude の答えを、一覧にあるものだけに整える。今の系統を必ず含める。 */
function normalize(answer: unknown, family: string, fallback: Stored[]): Stored[] {
  const list = (typeof answer === "object" && answer !== null ? (answer as { candidates?: unknown }).candidates : []) as unknown;
  const seen = new Set<string>();
  const picks: Stored[] = [];
  for (const item of Array.isArray(list) ? (list as { family?: unknown; reason?: unknown }[]) : []) {
    const entry = catalogEntry(item.family);
    if (!entry || seen.has(entry.id) || typeof item.reason !== "string") continue;
    seen.add(entry.id);
    picks.push({ family: entry.id, reason: item.reason.slice(0, MAX_REASON) });
  }
  if (!seen.has(family)) {
    const own = fallback.find((item) => item.family === family);
    if (own) picks.unshift(own);
  }
  for (const item of fallback) {
    if (picks.length >= MIN_CANDIDATES) break;
    if (!picks.some((pick) => pick.family === item.family)) picks.push(item);
  }
  return picks.slice(0, MAX_CANDIDATES);
}

function present(stored: Stored[], stage: number): EvolutionCandidate[] {
  return stored.map(({ family, reason }) => {
    return {
      family,
      name: catalogEntry(family)?.name ?? family,
      reason,
      image: companionImage(family, stage),
    };
  });
}

function loadStored(db: DatabaseSync, personId: string, stage: number): Stored[] | null {
  const row = db.prepare("SELECT candidates FROM avatar_evolutions WHERE person_id = ? AND target_stage = ?").get(personId, stage) as
    | { candidates: string }
    | undefined;
  return row ? (JSON.parse(row.candidates) as Stored[]) : null;
}

/**
 * 進化の候補。Claude を呼ぶのは本人が見たいと押したときで、段階ごとに1回だけ。
 * テストと台本ではコードで出す。失敗してもコードの候補で進められる。
 */
export async function evolutionCandidates(
  claude: ClaudeClient,
  db: DatabaseSync,
  personId: string,
  now: Date = new Date(),
): Promise<EvolutionCandidate[] | null> {
  const stage = pendingEvolution(db, personId);
  const row = loadRow(db, personId);
  if (stage === null || !row) return null;
  const saved = loadStored(db, personId, stage);
  if (saved) return present(saved, stage);

  const fallback = codeCandidates(personId, row.family, stage);
  let stored = fallback;
  if (claude.mode === "real") {
    const mood = (db.prepare("SELECT talent FROM avatar_art WHERE person_id = ?").get(personId) as { talent: string | null } | undefined)?.talent ?? "";
    try {
      const { text, refused } = await claude.complete({
        task: "avatar_evolve",
        system: evolveSystemPrompt,
        messages: [{ role: "user", content: `今の系統：${row.family}\n得意なこと：${mood || "まだありません"}\n進化の候補を出してください。` }],
        maxTokens: MAX_TOKENS,
        jsonSchema: evolveSchema,
      });
      if (!refused) stored = normalize(JSON.parse(text), row.family, fallback);
    } catch (error) {
      console.error("進化の候補を作れませんでした", error instanceof Error ? error.name : "unknown");
    }
  }
  db.prepare("INSERT OR IGNORE INTO avatar_evolutions (person_id, target_stage, candidates, created_at) VALUES (?, ?, ?, ?)").run(
    personId,
    stage,
    JSON.stringify(stored),
    now.toISOString(),
  );
  return present(stored, stage);
}

/** 本人が選ぶ。候補にないものは選べない。今までと違う系統にも進める。 */
export function chooseEvolution(db: DatabaseSync, personId: string, family: unknown): AvatarView | null {
  const stage = pendingEvolution(db, personId);
  const row = loadRow(db, personId);
  if (stage === null || !row || typeof family !== "string") return null;
  const stored = loadStored(db, personId, stage);
  if (!stored?.some((item) => item.family === family)) return null;
  // 段階の数が系統で違っても、絵のある段階に収める
  const next = Math.min(stage, catalogEntry(family)?.stages ?? 1);
  db.prepare("UPDATE avatars SET family = ?, shown_stage = ? WHERE person_id = ?").run(family, next, personId);
  return getAvatar(db, personId);
}

/** 分身を隠している間も育つ。切り替えるときは、育った姿をそのまま見せる。 */
export function catchUpAvatar(db: DatabaseSync, personId: string): void {
  const row = loadRow(db, personId);
  if (!row || row.family === PENDING_FAMILY) return;
  const now = earned(db, personId, row.family);
  if (row.shown_stage === null || now > row.shown_stage) {
    db.prepare("UPDATE avatars SET shown_stage = ? WHERE person_id = ?").run(now, personId);
  }
}

export async function handleEvolve(claude: ClaudeClient, db: DatabaseSync, personId: string, input: unknown) {
  const { action, family } = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  if (action === "candidates") {
    const candidates = await evolutionCandidates(claude, db, personId);
    return candidates ? { status: 200, body: { candidates } } : { status: 409, body: { error: "今は進化できません" } };
  }
  if (action === "choose") {
    const avatar = chooseEvolution(db, personId, family);
    return avatar ? { status: 200, body: { avatar } } : { status: 400, body: { error: "選べませんでした" } };
  }
  return { status: 400, body: { error: "依頼が正しくありません" } };
}
