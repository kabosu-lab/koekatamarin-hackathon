import type { Pose } from "./avatar-draw";

export type CatalogEntry = {
  id: string;
  name: string;
  group: "creature" | "human";
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

/** 絵の一覧。絵そのものは手元の .private/art/ にあり、ここには名前と雰囲気だけを書く。 */
export const CATALOG: readonly CatalogEntry[] = [
  { id: "cloud", name: "雲の子", group: "creature", mood: "ふんわり、やさしい、白と水色、ほっとする、聞き上手", color: "#4db8ff", stages: CREATURE_STAGES, poses: ["highfive", "cheer", "stretch"] },
  { id: "bird", name: "風の鳥", group: "creature", mood: "さわやか、軽やか、空、青、遠くへ進む、自由", color: "#2f7bff", stages: CREATURE_STAGES, poses: [] },
  { id: "beast", name: "桜の獣", group: "creature", mood: "あたたかい、甘い、ピンク、花、季節、癒やし", color: "#ff7fb0", stages: CREATURE_STAGES, poses: [] },
  { id: "dragon", name: "若葉の竜", group: "creature", mood: "力強い、緑、自然、引っぱる、頼もしい", color: "#18a96b", stages: CREATURE_STAGES, poses: [] },
  { id: "spirit", name: "灯火の精霊", group: "creature", mood: "夕焼け、炎、あたたかい光、オレンジ、ほっと一息", color: "#ff6b3d", stages: CREATURE_STAGES, poses: ["highfive", "cheer", "stretch"] },
  { id: "elder", name: "語り部", group: "human", mood: "落ち着き、経験、茶色、本、話をじっくり聞く", color: "#a8703a", stages: HUMAN_STAGES, poses: [] },
  { id: "craft", name: "つくり手", group: "human", mood: "手仕事、道具、機械、銀色、ものづくり", color: "#6d6df0", stages: HUMAN_STAGES, poses: [] },
  { id: "jacket", name: "まとめ役", group: "human", mood: "かっこいい、都会、紺、人を引っぱる、きちんと", color: "#2a3a8f", stages: HUMAN_STAGES, poses: [] },
  { id: "coat", name: "探究者", group: "human", mood: "知的、静か、夜、調べる、白衣、考える", color: "#5b3fa8", stages: HUMAN_STAGES, poses: [] },
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
