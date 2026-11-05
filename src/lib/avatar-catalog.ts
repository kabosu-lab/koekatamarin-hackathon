import type { Pose } from "./avatar-draw";

export type CatalogEntry = {
  id: string;
  name: string;
  group: "creature" | "human";
  /** 色の系統。最初の色に近い動物を先に候補にする */
  tone: "blue" | "green" | "warm" | "yellow" | "purple" | "pink";
  /** Claude が写真の雰囲気と照らす言葉 */
  mood: string;
  /** 誕生の画面の大胆な背景の色 */
  color: string;
  stages: number;
  /** 専用の絵があるポーズ。ないポーズは、ふつうの絵を動きで見せる */
  poses: readonly Pose[];
};

const CREATURE_STAGES = 3;
const HUMAN_STAGES = 5;

/** パートナーの一覧。絵は companion-art.ts がコードで描く。段階1までは声のかたまりで、育つと動物になる。 */
export const CATALOG: readonly CatalogEntry[] = [
  { id: "dolphin", name: "イルカ", group: "creature", tone: "blue", mood: "人なつこい、水色、つなぐ、軽やか", color: "#7fcfc9", stages: CREATURE_STAGES, poses: [] },
  { id: "cloud", name: "クジラ", group: "creature", tone: "blue", mood: "ゆったり、やさしい、水色、ほっとする、聞き上手", color: "#7fb6d9", stages: CREATURE_STAGES, poses: [] },
  { id: "penguin", name: "ペンギン", group: "creature", tone: "blue", mood: "まじめ、紺と白、みんなと一緒、こつこつ", color: "#3d4a63", stages: CREATURE_STAGES, poses: [] },
  { id: "turtle", name: "カメ", group: "creature", tone: "green", mood: "落ち着き、緑、続ける、自分のペース", color: "#7dbb7a", stages: CREATURE_STAGES, poses: [] },
  { id: "dragon", name: "カエル", group: "creature", tone: "green", mood: "明るい、若葉、飛び込む、はじめの一歩", color: "#8ccf6d", stages: CREATURE_STAGES, poses: [] },
  { id: "elder", name: "フクロウ", group: "human", tone: "green", mood: "落ち着き、経験、茶色、本、話をじっくり聞く", color: "#a8875f", stages: HUMAN_STAGES, poses: [] },
  { id: "spirit", name: "キツネ", group: "creature", tone: "warm", mood: "夕焼け、オレンジ、機転、工夫する", color: "#ee8f4f", stages: CREATURE_STAGES, poses: [] },
  { id: "craft", name: "タヌキ", group: "human", tone: "warm", mood: "手仕事、道具、ものづくり、おおらか", color: "#a98a68", stages: HUMAN_STAGES, poses: [] },
  { id: "bird", name: "渡り鳥", group: "creature", tone: "warm", mood: "さわやか、空、遠くへ進む、みんなで飛ぶ", color: "#5f9fd6", stages: CREATURE_STAGES, poses: [] },
  { id: "bee", name: "ミツバチ", group: "creature", tone: "yellow", mood: "黄色、働き者、花から花へ、運ぶ", color: "#f4c64f", stages: CREATURE_STAGES, poses: [] },
  { id: "chick", name: "ヒヨコ", group: "creature", tone: "yellow", mood: "黄色、素直、これから、のびのび", color: "#f7dd77", stages: CREATURE_STAGES, poses: [] },
  { id: "jacket", name: "イヌ", group: "human", tone: "yellow", mood: "人を引っぱる、まっすぐ、一緒に走る", color: "#c79a6b", stages: HUMAN_STAGES, poses: [] },
  { id: "coat", name: "ネコ", group: "human", tone: "purple", mood: "知的、静か、夜、調べる、考える", color: "#6d6a94", stages: HUMAN_STAGES, poses: [] },
  { id: "beast", name: "ウサギ", group: "creature", tone: "pink", mood: "あたたかい、ピンク、花、季節、癒やし", color: "#f2bcc6", stages: CREATURE_STAGES, poses: [] },
];

export function catalogEntry(id: unknown): CatalogEntry | null {
  return CATALOG.find((entry) => entry.id === id) ?? null;
}

const POSE_FILE: Partial<Record<Pose, string>> = { highfive: "hi", cheer: "cheer", stretch: "stretch" };

/** その系統の、その段階とポーズの絵の名前。専用の絵がなければ、その段階のふつうの絵。 */
export function artNameFor(family: string, stage: number, pose: Pose = "normal"): string | null {
  const entry = catalogEntry(family);
  if (!entry) return null;
  const suffix = POSE_FILE[pose];
  if (suffix && entry.poses.includes(pose)) return `${family}-${suffix}.png`;
  return `${family}-${Math.min(Math.max(stage, 1), entry.stages)}.png`;
}

export function allArtNames(): string[] {
  return CATALOG.flatMap((entry) => [
    ...Array.from({ length: entry.stages }, (_, i) => `${entry.id}-${i + 1}.png`),
    ...entry.poses.map((pose) => `${entry.id}-${POSE_FILE[pose]}.png`),
  ]);
}

/** Claude に渡す一覧。 */
export function catalogForPrompt(): string {
  return CATALOG.map((entry) => `- ${entry.id}（${entry.name}）：${entry.mood}`).join("\n");
}
