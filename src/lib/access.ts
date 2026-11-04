import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "koekata_access";
export const ACCESS_PATH = "/access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;
const MAX_INPUT_LENGTH = 200;

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** 長さが違っても同じ手順で比べるよう、ハッシュにしてから定数時間で比べる。 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function codeMatches(input: unknown, code: string): boolean {
  if (typeof input !== "string" || input.length > MAX_INPUT_LENGTH) return false;
  return safeEqual(input.trim(), code);
}

/** cookie に合言葉そのものを入れない。合言葉を変えると、前の cookie は使えなくなる。 */
export function accessToken(code: string): string {
  return createHmac("sha256", code).update("koekata-access-v1").digest("base64url");
}

export function tokenMatches(token: string | undefined, code: string): boolean {
  return token !== undefined && safeEqual(token, accessToken(code));
}

export function accessCookieHeader(code: string): string {
  return `${ACCESS_COOKIE}=${accessToken(code)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
}

/** 合言葉なしで開ける道。入力画面と、起動の確認だけ。 */
export function isOpenPath(pathname: string): boolean {
  return pathname === ACCESS_PATH || pathname === "/api/health";
}

export type GateDecision = "pass" | "to_access" | "unauthorized";

/** ページの表示だけ入力画面へ送り、API や画面からの送信は止めて 401 を返す。 */
export function decideGate(input: {
  code: string | null;
  pathname: string;
  method: string;
  token: string | undefined;
}): GateDecision {
  if (input.code === null || isOpenPath(input.pathname) || tokenMatches(input.token, input.code)) return "pass";
  const isPageView = (input.method === "GET" || input.method === "HEAD") && !input.pathname.startsWith("/api/");
  return isPageView ? "to_access" : "unauthorized";
}
