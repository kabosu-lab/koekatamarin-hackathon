import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * みんな用（judge.mjs の public。合言葉なし・台本）で、訪問者ごとに書き込みを分ける（BACKLOG 0-3n）。
 * 訪問者は cookie の乱数で見分け、訪問者ごとに別の DB ファイルを開く。ダミーの初期データは、どの DB にも同じく入る。
 * cookie には、起動ごとの秘密（KOEKATA_VISITOR_SECRET）で署名を付け、こちらが出した ID だけを DB の作成に進ませる。
 * KOEKATA_PUBLIC=1 のときだけ働き、審査員用・試用版・ふつうの動きは今のまま。
 * proxy からも読むので、DB などの処理はここに置かない。
 */
export const VISITOR_COOKIE = "koekata_visitor";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const VISITOR_ID = /^[0-9a-f]{32}$/;
const SIGNED = /^([0-9a-f]{32})\.([0-9a-f]{32})$/;

export function isPublicMode(): boolean {
  return process.env.KOEKATA_PUBLIC?.trim() === "1";
}

/**
 * 署名の秘密。judge.mjs が起動のたびに乱数で作って渡す（ファイルにもログにも出さない）。
 * 渡されていないときは、この起動の中だけの乱数を作る（proxy と画面は同じプロセスなので、同じ値を読む）。
 */
function visitorSecret(): string {
  const given = process.env.KOEKATA_VISITOR_SECRET?.trim();
  if (given) return given;
  const made = randomBytes(32).toString("hex");
  process.env.KOEKATA_VISITOR_SECRET = made;
  return made;
}

/** ファイル名に使うので、形が決まったものだけを通す */
export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

/** 推測できない 128 ビットの乱数 */
export function newVisitorId(): string {
  return randomBytes(16).toString("hex");
}

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`koekata-visitor-v1:${id}`).digest("hex").slice(0, 32);
}

/** cookie に入れる値。ID と署名 */
export function signVisitorId(id: string, secret: string = visitorSecret()): string {
  if (!isValidVisitorId(id)) throw new Error("訪問者の ID の形が違います");
  return `${id}.${sign(id, secret)}`;
}

/** cookie の値から、こちらが出した ID だけを取り出す。形が違う・署名が合わないものは null */
export function verifyVisitorCookie(value: unknown, secret: string = visitorSecret()): string | null {
  if (typeof value !== "string") return null;
  const match = SIGNED.exec(value);
  if (!match) return null;
  const [, id, mac] = match;
  const ok = timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(sign(id, secret), "hex"));
  return ok ? id : null;
}

/** 訪問者の DB を置く場所。もとの DB の隣のフォルダ */
export function visitorsDir(basePath: string): string {
  return `${basePath}-visitors`;
}

export function visitorDbPath(basePath: string, id: string): string {
  if (!isValidVisitorId(id)) throw new Error("訪問者の ID の形が違います");
  return `${visitorsDir(basePath)}/${id}.db`;
}

/** proxy で、訪問者の cookie を新しく出すか。署名の合わない cookie は出し直す */
export function decideVisitorCookie({ publicMode, existing }: { publicMode: boolean; existing: string | undefined }): "none" | "keep" | "issue" {
  if (!publicMode) return "none";
  return verifyVisitorCookie(existing) ? "keep" : "issue";
}
