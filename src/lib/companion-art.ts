import type { LumpShapeName } from "./lump-shapes";

/**
 * パートナーの絵。Claude がコードで描いた SVG で、画像の生成も外の絵も使わない。
 * 体は共通の部品にして、耳、ひれ、羽などを足す。既存のキャラクターに似せない。
 * 最初は声のかたまり（吹き出しの形）で、育つと動物になる。
 */
type Species = {
  main: string;
  belly: string;
  /** 体の後ろに描く部品 */
  back?: string;
  /** 体の前に描く部品 */
  front?: string;
  /** 体の形。ふつうは丸く、低いと横に広い */
  shape?: "round" | "tall" | "wide";
};

const INK = "#20232e";

export type LumpLook = { color?: string; shape?: LumpShapeName };

const SPECIES: Record<string, Species> = {
  // 青、水色
  cloud: {
    main: "#7fb6d9",
    belly: "#eef7fb",
    shape: "wide",
    back: `<path d="M172 96c14-10 22-22 18-32-8 2-16 8-20 14-4-8-12-12-20-12 2 12 8 22 18 30z" fill="#6aa3c8"/>`,
    front: `<path d="M100 26c-3-8-8-12-8-18M100 26c3-8 8-12 8-18" stroke="#9fd0ea" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  },
  dolphin: {
    main: "#7fcfc9",
    belly: "#fbf8f0",
    back: `<path d="M100 22c18 2 26 14 26 26h-34c0-10 2-18 8-26z" fill="#62b6b4"/>`,
    front: `<ellipse cx="100" cy="112" rx="24" ry="14" fill="#fbf8f0"/><ellipse cx="38" cy="130" rx="10" ry="24" fill="#62b6b4" transform="rotate(26 38 130)"/><ellipse cx="162" cy="130" rx="10" ry="24" fill="#62b6b4" transform="rotate(-26 162 130)"/>`,
  },
  penguin: {
    main: "#3d4a63",
    belly: "#fbf8f0",
    shape: "tall",
    front: `<path d="M88 104h24l-12 14z" fill="#f2b23e"/><ellipse cx="42" cy="124" rx="9" ry="26" fill="#2f3a50" transform="rotate(16 42 124)"/><ellipse cx="158" cy="124" rx="9" ry="26" fill="#2f3a50" transform="rotate(-16 158 124)"/>`,
  },
  // 緑
  turtle: {
    main: "#7dbb7a",
    belly: "#eef2d6",
    shape: "wide",
    back: `<ellipse cx="100" cy="124" rx="74" ry="52" fill="#4f8f5e"/><path d="M60 110l40-24 40 24-14 40H74z" fill="#6aa877"/>`,
  },
  dragon: {
    main: "#8ccf6d",
    belly: "#f3f6d6",
    back: `<circle cx="66" cy="48" r="22" fill="#8ccf6d"/><circle cx="134" cy="48" r="22" fill="#8ccf6d"/>`,
    front: `<circle cx="66" cy="44" r="11" fill="#fff"/><circle cx="134" cy="44" r="11" fill="#fff"/><circle cx="66" cy="44" r="5" fill="${INK}"/><circle cx="134" cy="44" r="5" fill="${INK}"/>`,
  },
  elder: {
    main: "#a8875f",
    belly: "#f4e8d2",
    back: `<path d="M56 54L44 22l36 18zM144 54l12-32-36 18z" fill="#8c6f4a"/>`,
    front: `<circle cx="74" cy="84" r="24" fill="#f4e8d2"/><circle cx="126" cy="84" r="24" fill="#f4e8d2"/><path d="M92 102h16l-8 14z" fill="#e0a43a"/>`,
  },
  // 赤、オレンジ
  spirit: {
    main: "#ee8f4f",
    belly: "#fdf1e0",
    back: `<path d="M50 62L40 16l40 26zM150 62l10-46-40 26z" fill="#d97a3c"/><path d="M160 158c26-4 34-30 22-50-4 18-16 26-36 30z" fill="#d97a3c"/>`,
  },
  craft: {
    main: "#a98a68",
    belly: "#efe2cc",
    back: `<circle cx="58" cy="46" r="17" fill="#8a6e50"/><circle cx="142" cy="46" r="17" fill="#8a6e50"/>`,
    front: `<ellipse cx="72" cy="88" rx="24" ry="16" fill="#5d4a38"/><ellipse cx="128" cy="88" rx="24" ry="16" fill="#5d4a38"/>`,
  },
  bird: {
    main: "#5f9fd6",
    belly: "#fdf6ea",
    shape: "wide",
    back: `<path d="M34 112C6 96 8 72 8 72c22 2 40 14 48 30zM166 112c28-16 26-40 26-40-22 2-40 14-48 30z" fill="#4b86bb"/>`,
    front: `<path d="M86 104h28l-14 16z" fill="#f2b23e"/>`,
  },
  // 黄
  bee: {
    main: "#f4c64f",
    belly: "#f4c64f",
    back: `<ellipse cx="50" cy="66" rx="30" ry="20" fill="#dcecf5" transform="rotate(-24 50 66)"/><ellipse cx="150" cy="66" rx="30" ry="20" fill="#dcecf5" transform="rotate(24 150 66)"/>`,
    front: `<path d="M38 130q62 18 124 0v16q-62 18-124 0zM50 162q50 14 100 0l-8 12q-42 10-84 0z" fill="#3c3a44"/><path d="M84 42c-4-12-12-16-12-22M116 42c4-12 12-16 12-22" stroke="#3c3a44" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  },
  chick: {
    main: "#f7dd77",
    belly: "#fff6c9",
    front: `<path d="M88 102h24l-12 14z" fill="#ee9a3c"/><path d="M92 34c2-10 8-14 8-22 4 6 8 12 8 22z" fill="#f2c94f"/>`,
  },
  jacket: {
    main: "#c79a6b",
    belly: "#f5e7d3",
    back: `<ellipse cx="42" cy="84" rx="18" ry="36" fill="#a97f53"/><ellipse cx="158" cy="84" rx="18" ry="36" fill="#a97f53"/>`,
    front: `<ellipse cx="100" cy="112" rx="24" ry="16" fill="#f5e7d3"/><ellipse cx="100" cy="102" rx="8" ry="6" fill="${INK}"/>`,
  },
  // 紫、紺
  coat: {
    main: "#6d6a94",
    belly: "#ebe7f4",
    back: `<path d="M50 62L44 16l40 28zM150 62l6-46-40 28z" fill="#5a5780"/>`,
    front: `<path d="M94 104h12l-6 7z" fill="#f0a6b4"/><path d="M60 104H34M60 116H36M140 104h26M140 116h24" stroke="#ebe7f4" stroke-width="3" stroke-linecap="round"/>`,
  },
  // ピンク、白
  beast: {
    main: "#f2bcc6",
    belly: "#fff5f3",
    back: `<ellipse cx="74" cy="34" rx="15" ry="36" fill="#f2bcc6"/><ellipse cx="126" cy="34" rx="15" ry="36" fill="#f2bcc6"/><ellipse cx="74" cy="34" rx="7" ry="24" fill="#fbdfe4"/><ellipse cx="126" cy="34" rx="7" ry="24" fill="#fbdfe4"/>`,
    front: `<path d="M94 104h12l-6 7z" fill="#e88a9b"/>`,
  },
};

export const COMPANION_FAMILIES = Object.keys(SPECIES);

const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">`;

const LUMP_BODY: Record<LumpShapeName, (color: string) => string> = {
  bubble: (c) => `<path d="M100 34c50 0 84 26 84 60s-34 60-84 60c-6 0-12 0-18-1-6 10-20 20-32 21-5 0-7-4-4-8 5-7 8-14 8-22-24-10-38-29-38-50 0-34 34-60 84-60z" fill="${c}"/>`,
  drop: (c) => `<circle cx="100" cy="102" r="72" fill="${c}"/>`,
  mochi: (c) => `<path d="M100 44c50 0 80 34 80 72 0 32-30 42-80 42s-80-10-80-42c0-38 30-72 80-72z" fill="${c}"/>`,
  fluff: (c) => [[100, 100, 54], [58, 92, 30], [142, 92, 30], [68, 136, 30], [132, 136, 30], [100, 56, 30], [100, 148, 28], [46, 118, 24], [154, 118, 24]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join(""),
  cloud: (c) => [[100, 104, 52], [52, 118, 36], [148, 118, 36], [72, 84, 32], [128, 84, 34]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join(""),
  jelly: (c) => `<path d="M100 26c42 0 62 34 62 76v46c0 12-14 14-20 6-6 8-20 8-26 0-6 8-26 8-32 0-6 8-20 8-24-6v-46c0-42 18-76 40-76z" fill="${c}"/>`,
  pebble: (c) => `<path d="M34 118c-8-38 28-62 72-60 40 2 66 24 62 60-4 28-34 38-70 38-32 0-58-12-64-38z" fill="${c}"/>`,
};

/** 声のかたまりの中身。形はどれも、丸みがあって、点の目だけ。 */
export function lumpMarkup(color: string, shape: LumpShapeName = "bubble"): string {
  return `${LUMP_BODY[shape](color)}<ellipse cx="68" cy="66" rx="18" ry="9" fill="#fff" opacity="0.4" transform="rotate(-20 68 66)"/><circle cx="78" cy="98" r="5" fill="${INK}"/><circle cx="122" cy="98" r="5" fill="${INK}"/>`;
}

function lump(color: string, shape: LumpShapeName): string {
  return `${SVG_OPEN}${lumpMarkup(color, shape)}</svg>`;
}

function animal(species: Species, stage: number): string {
  const body = {
    round: `<ellipse cx="100" cy="112" rx="66" ry="68" fill="${species.main}"/><ellipse cx="100" cy="134" rx="42" ry="42" fill="${species.belly}"/>`,
    tall: `<ellipse cx="100" cy="110" rx="58" ry="76" fill="${species.main}"/><ellipse cx="100" cy="134" rx="40" ry="50" fill="${species.belly}"/>`,
    wide: `<ellipse cx="100" cy="116" rx="76" ry="58" fill="${species.main}"/><ellipse cx="100" cy="138" rx="48" ry="32" fill="${species.belly}"/>`,
  }[species.shape ?? "round"];
  const eyes = `<circle cx="78" cy="88" r="6" fill="${INK}"/><circle cx="122" cy="88" r="6" fill="${INK}"/><circle cx="80" cy="86" r="2" fill="#fff"/><circle cx="124" cy="86" r="2" fill="#fff"/>`;
  // 育つほど、小さな星が増える。比べるためではなく、歩みの印
  const stars = Array.from({ length: Math.max(0, Math.min(stage - 2, 3)) }, (_, index) => `<circle cx="${150 + index * 14}" cy="${176 - index * 6}" r="4" fill="#f4c64f"/>`).join("");
  return `${SVG_OPEN}${species.back ?? ""}${body}${species.front ?? ""}${eyes}${stars}</svg>`;
}

/** 系統と段階から絵を作る。知らない系統は null。段階1までは声のかたまり。 */
export function companionSvg(family: string, stage: number, look: LumpLook = {}): string | null {
  if (!Object.hasOwn(SPECIES, family)) return null;
  const species = SPECIES[family];
  return stage <= 1 ? lump(look.color ?? species.main, look.shape ?? "bubble") : animal(species, stage);
}

export function companionImage(family: string, stage: number): string {
  return `/api/companion/${family}-${stage}`;
}

/** 窓の声のかたまりの色。 */
export function companionColor(family: string | null): string {
  return (family && Object.hasOwn(SPECIES, family) ? SPECIES[family].main : null) ?? "#7fcfc9";
}
