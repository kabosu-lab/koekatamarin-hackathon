import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleTalk } from "@/lib/talk-request";

/** 依頼を出した画面の道（感想の場所に使う）。読めなければ undefined */
function refererPath(request: Request): string | undefined {
  try {
    return new URL(request.headers.get("referer") ?? "").pathname;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleTalk(createClaude(), getDatabase(), viewer.id, input, new Date(), refererPath(request));
  return Response.json(body, { status });
}
