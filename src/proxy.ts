import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_PATH, decideGate } from "@/lib/access";
import { accessCode } from "@/lib/trial";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE_SECONDS, decideVisitorCookie, isPublicMode, newVisitorId } from "@/lib/visitor";

// matcher を付けず、静的なファイルも含めてすべての道を通す
export function proxy(request: NextRequest) {
  const decision = decideGate({
    code: accessCode(),
    pathname: request.nextUrl.pathname,
    method: request.method,
    token: request.cookies.get(ACCESS_COOKIE)?.value,
  });
  if (decision === "unauthorized") return NextResponse.json({ error: "合言葉が必要です" }, { status: 401 });
  if (decision !== "pass") return NextResponse.redirect(new URL(ACCESS_PATH, request.nextUrl), 303);
  // みんな用（0-3n）：訪問者ごとに書き込みを分けるため、初めての訪問者に乱数の ID を渡す。死活の確かめでは出さない
  const visitor = decideVisitorCookie({ publicMode: isPublicMode(), existing: request.cookies.get(VISITOR_COOKIE)?.value });
  if (visitor !== "issue" || request.nextUrl.pathname === "/api/health") return NextResponse.next();
  const id = newVisitorId();
  // 最初の要求から、その訪問者の DB を使うよう、要求の cookie にも入れる
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request });
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
