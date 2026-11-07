import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { markThanksOpened, thanksSeenSince } from "@/lib/new-counts";

/**
 * 0-3a：封筒から開けたカードを、開封済みにする。開けた最後のカードの時刻までにする
 * （見ている間に届いた次のカードは、次に開いたときにまた封筒で届く）。
 */
export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { until?: unknown } | null;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const now = new Date();
  const until = typeof input?.until === "string" ? new Date(input.until) : now;
  const at = Number.isNaN(until.getTime()) || until > now ? now : until;
  const since = thanksSeenSince(db, viewer.id);
  // 前に開いた時刻より戻さない
  if (!since || since < at.toISOString()) markThanksOpened(db, viewer.id, at);
  return Response.json({ ok: true });
}
