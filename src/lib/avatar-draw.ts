import { createHash } from "node:crypto";

/** 写真から読み取るもの。色と持ち物の雰囲気だけで、人のことは入れない。 */
export type AvatarTraits = { colors: [string, string, string]; motif: string; mood: string };

export const POSES = ["normal", "highfive", "cheer", "stretch", "study"] as const;
export type Pose = (typeof POSES)[number];
export type PoseFragments = Record<Pose, string>;
export type Drawing = { body: string; poses: PoseFragments };

export const VIEW_BOX = "0 0 200 200";

const PALETTES: [string, string, string][] = [
  ["#2545f0", "#ff6b4a", "#14213d"],
  ["#00b894", "#ffd166", "#10302a"],
  ["#ff6b4a", "#ffd166", "#3a1510"],
  ["#7c5cff", "#2fd4c0", "#1d1547"],
  ["#ff5fa2", "#2545f0", "#3a0f25"],
  ["#00a6fb", "#ffbe0b", "#06283d"],
];

/** 写真がない人にも一人ずつ違う色を渡す。 */
export function traitsFromSeed(seed: string): AvatarTraits {
  const index = createHash("sha256").update(seed).digest()[0] % PALETTES.length;
  return { colors: PALETTES[index], motif: "", mood: "" };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function parseTraits(value: unknown): AvatarTraits | null {
  const { colors, motif, mood } = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  if (!Array.isArray(colors) || colors.length !== 3 || !colors.every((c) => typeof c === "string" && HEX.test(c))) return null;
  const short = (text: unknown) => (typeof text === "string" ? text.trim().slice(0, 20) : "");
  return { colors: colors as [string, string, string], motif: short(motif), mood: short(mood) };
}

const arm = (d: string, color: string) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>`;

/** コードで描く絵。Claude が使えないときと、比べるときに使う。文字は描かない。 */
export function drawWithCode({ colors: [main, accent, ink] }: AvatarTraits, stage: number): Drawing {
  const extras = [
    stage >= 2 ? `<circle cx="100" cy="42" r="12" fill="${accent}"/><path d="M100 54V66" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>` : "",
    stage >= 3 ? `<path d="M64 150h72" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>` : "",
    stage >= 4 ? `<circle cx="44" cy="58" r="7" fill="${accent}"/><circle cx="158" cy="48" r="5" fill="${accent}"/>` : "",
  ].join("");
  const body = [
    `<rect x="52" y="66" width="96" height="104" rx="44" fill="${main}"/>`,
    `<ellipse cx="100" cy="146" rx="30" ry="18" fill="${accent}" fill-opacity="0.35"/>`,
    `<circle cx="84" cy="104" r="7" fill="#ffffff"/><circle cx="116" cy="104" r="7" fill="#ffffff"/>`,
    `<circle cx="85" cy="105" r="3.5" fill="${ink}"/><circle cx="117" cy="105" r="3.5" fill="${ink}"/>`,
    `<path d="M88 124q12 10 24 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`,
    extras,
  ].join("");
  return {
    body,
    poses: {
      normal: arm("M54 118q-16 12-14 32", main) + arm("M146 118q16 12 14 32", main),
      highfive: arm("M54 118q-16 12-14 32", main) + arm("M146 112q20-22 22-58", main) + `<circle cx="168" cy="44" r="11" fill="${accent}"/>`,
      cheer: arm("M54 112q-20-22-22-58", main) + arm("M146 112q20-22 22-58", main) + `<circle cx="32" cy="44" r="9" fill="${accent}"/><circle cx="168" cy="44" r="9" fill="${accent}"/>`,
      stretch: arm("M56 96q-6-40 34-66", main) + arm("M144 96q6-40-34-66", main) + `<circle cx="100" cy="26" r="9" fill="${accent}"/>`,
      study:
        arm("M54 122q6 20 26 28", main) +
        arm("M146 122q-6 20-26 28", main) +
        `<path d="M58 146l42 10 42-10v26l-42 10-42-10z" fill="${accent}"/><path d="M100 156v26" stroke="${ink}" stroke-width="4"/>`,
    },
  };
}

/** 写真の色が付いた卵。やり取りが始まるまでの姿で、Claude を呼ばない。 */
export function drawEgg({ colors: [main, accent] }: AvatarTraits): string {
  return `<ellipse cx="100" cy="110" rx="56" ry="70" fill="${main}"/><path d="M50 118q25 18 50 0t50 0" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/><circle cx="82" cy="78" r="9" fill="#ffffff" fill-opacity="0.7"/>`;
}

/** 配信の形にする。この関数に通すのは sanitizeSvgFragment を通った断片か、コードで描いた断片だけ。 */
export function toSvg(...fragments: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="200" height="200">${fragments.join("")}</svg>`;
}
