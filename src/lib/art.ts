import { readFile } from "node:fs/promises";
import { allArtNames } from "./avatar-catalog";

/**
 * 絵は公開リポジトリに入れず、手元の .private/art/ から読む（運営に確認が取れるまで）。
 * KOEKATA_AVATAR_ART=code で、パートナーの絵だけをコードの絵に切り替えられる。
 * ない環境では、コードで描いた簡単な代わりを返すので、誰の手元でも画面は壊れない。
 */
export const ART_DIR = ".private/art";

const SEASONS = ["haru", "natsu", "aki", "fuyu"];

const allowed = new Set<string>([
  "egg.png",
  ...allArtNames(),
  ...SEASONS.map((s) => `school-${s}.jpg`),
]);

export function isArtName(name: string): boolean {
  return allowed.has(name);
}

const FAMILY_COLOR: Record<string, string> = {
  dragon: "#8fcfa8",
  bird: "#9db8e8",
  spirit: "#f4b183",
  cloud: "#bfe3f7",
  beast: "#e8a9c0",
  coat: "#d7d3e0",
  jacket: "#8a8fa8",
  craft: "#c9a27a",
  elder: "#cfc4b0",
  egg: "#f3ead8",
};

const SEASON_COLOR: Record<string, [string, string]> = {
  haru: ["#fde3ec", "#f7bcd0"],
  natsu: ["#d9f0ff", "#9fd8a8"],
  aki: ["#fdeccf", "#e8a96b"],
  fuyu: ["#e9eef5", "#c7d3e0"],
};

/** 絵がない環境で使う、コードで描いた代わりの絵。 */
export function placeholderSvg(name: string): string {
  const school = name.match(/^school-(\w+)\.jpg$/);
  if (school) {
    const [sky, ground] = SEASON_COLOR[school[1]] ?? SEASON_COLOR.haru;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="${sky}"/><rect y="170" width="400" height="70" fill="${ground}"/><rect x="60" y="90" width="170" height="90" fill="#fff" stroke="#b9aea6"/><circle cx="310" cy="105" r="52" fill="${ground}"/><rect x="302" y="140" width="14" height="50" fill="#8a6a55"/></svg>`;
  }
  const family = name.split(/[-.]/)[0];
  const stage = Number(name.match(/-(\d)\./)?.[1] ?? 1);
  const color = FAMILY_COLOR[family] ?? "#ddd";
  const size = 26 + stage * 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><ellipse cx="60" cy="${family === "egg" ? 60 : 70}" rx="${size}" ry="${family === "egg" ? 44 : size}" fill="${color}" stroke="#7d7068" stroke-width="2"/>${family === "egg" ? "" : `<circle cx="50" cy="66" r="4" fill="#3a302b"/><circle cx="70" cy="66" r="4" fill="#3a302b"/>`}</svg>`;
}

export type ArtResponse = { body: Uint8Array | string; contentType: string; placeholder: boolean };

/** 決まった名前の絵だけを返す。名前を一覧と照らすので、他のファイルは読めない。 */
export async function loadArt(
  name: string,
  dir: string = ART_DIR,
  env: Record<string, string | undefined> = process.env,
): Promise<ArtResponse | null> {
  if (!isArtName(name)) return null;
  // パートナーの絵は、運営の回答しだいで使えなくなる。背景はこの切り替えの対象にしない
  if (env.KOEKATA_AVATAR_ART === "code" && !name.startsWith("school-")) {
    return { body: placeholderSvg(name), contentType: "image/svg+xml", placeholder: true };
  }
  try {
    // ビルドツールがプロジェクト全体を追跡しないよう、この読み込みは追跡から外す
    const body = await readFile(/* turbopackIgnore: true */ [dir, name].join("/"));
    return { body, contentType: name.endsWith(".jpg") ? "image/jpeg" : "image/png", placeholder: false };
  } catch {
    return { body: placeholderSvg(name), contentType: "image/svg+xml", placeholder: true };
  }
}
