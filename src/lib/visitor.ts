/**
 * みんな用（judge.mjs の public。合言葉なし・台本）で、訪問者ごとに書き込みを分ける（BACKLOG 0-3n）。
 * 訪問者は cookie の乱数で見分け、訪問者ごとに別の DB ファイルを開く。ダミーの初期データは、どの DB にも同じく入る。
 * KOEKATA_PUBLIC=1 のときだけ働き、審査員用・試用版・ふつうの動きは今のまま。
 * proxy からも読むので、サーバー専用の処理（DB など）をここに置かない。
 */
export const VISITOR_COOKIE = "koekata_visitor";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const VISITOR_ID = /^[0-9a-f]{32}$/;

export function isPublicMode(): boolean {
  return process.env.KOEKATA_PUBLIC?.trim() === "1";
}

/** ファイル名に使うので、形が決まったものだけを通す */
export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

/** 推測できない 128 ビットの乱数 */
export function newVisitorId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 訪問者の DB を置く場所。もとの DB の隣のフォルダ */
export function visitorsDir(basePath: string): string {
  return `${basePath}-visitors`;
}

export function visitorDbPath(basePath: string, id: string): string {
  if (!isValidVisitorId(id)) throw new Error("訪問者の ID の形が違います");
  return `${visitorsDir(basePath)}/${id}.db`;
}

/** proxy で、訪問者の cookie を新しく出すか */
export function decideVisitorCookie({ publicMode, existing }: { publicMode: boolean; existing: string | undefined }): "none" | "keep" | "issue" {
  if (!publicMode) return "none";
  return isValidVisitorId(existing) ? "keep" : "issue";
}
