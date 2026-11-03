import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { shareAlert } from "@/lib/safety";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { alertId?: unknown; personIds?: unknown } | null;
  const alertId = input?.alertId;
  const personIds = input?.personIds;
  if (typeof alertId !== "string" || !Array.isArray(personIds) || !personIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "依頼が正しくありません" }, { status: 400 });
  }

  const { viewer } = await getViewer();
  if (!shareAlert(getDatabase(), alertId, viewer.id, personIds)) {
    return Response.json({ error: "伝えられませんでした" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
