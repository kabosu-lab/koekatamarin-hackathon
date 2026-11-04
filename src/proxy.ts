import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_PATH, decideGate } from "@/lib/access";
import { accessCode } from "@/lib/trial";

// matcher を付けず、静的なファイルも含めてすべての道を通す
export function proxy(request: NextRequest) {
  const decision = decideGate({
    code: accessCode(),
    pathname: request.nextUrl.pathname,
    method: request.method,
    token: request.cookies.get(ACCESS_COOKIE)?.value,
  });
  if (decision === "pass") return NextResponse.next();
  if (decision === "unauthorized") return NextResponse.json({ error: "合言葉が必要です" }, { status: 401 });
  return NextResponse.redirect(new URL(ACCESS_PATH, request.nextUrl), 303);
}
