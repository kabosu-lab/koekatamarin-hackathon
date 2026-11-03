import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { disputeAlert } from "@/lib/safety";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { alertId?: unknown } | null;
  const alertId = input?.alertId;
  if (typeof alertId !== "string") {
    return Response.json({ error: "依頼が正しくありません" }, { status: 400 });
  }

  const { viewer } = await getViewer();
  if (!disputeAlert(getDatabase(), alertId, viewer.id, new Date())) {
    return Response.json({ error: "届けられませんでした" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
