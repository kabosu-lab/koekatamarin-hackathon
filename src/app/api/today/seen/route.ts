import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { recordSeen } from "@/lib/today";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { postId?: unknown } | null;
  if (typeof input?.postId !== "string") return Response.json({ error: "依頼が正しくありません" }, { status: 400 });

  const { viewer } = await getViewer();
  const db = getDatabase();
  const ok = recordSeen(db, createDummyTeams(db), viewer.id, input.postId, new Date());
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
