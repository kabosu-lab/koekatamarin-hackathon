import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { applyTitleAction } from "@/lib/titles";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
  const { viewer } = await getViewer();
  if (!applyTitleAction(getDatabase(), viewer.id, input?.id, input?.action)) {
    return Response.json({ error: "変更できませんでした" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
