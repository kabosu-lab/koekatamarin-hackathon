import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { setHidden } from "@/lib/hidden-people";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { personId?: unknown; hidden?: unknown } | null;
  if (typeof input?.personId !== "string" || typeof input.hidden !== "boolean") {
    return Response.json({ error: "依頼が正しくありません" }, { status: 400 });
  }
  const { viewer } = await getViewer();
  if (!setHidden(getDatabase(), viewer.id, input.personId, input.hidden, new Date())) {
    return Response.json({ error: "変更できませんでした" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
