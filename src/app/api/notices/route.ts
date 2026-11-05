import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { syncFromTeamsIfStale } from "@/lib/destination/teams-bridge";
import { isNoticeHours } from "@/lib/inbox";
import { listReplyNotices, markRepliesSeen } from "@/lib/reply-notices";

/** 話す画面のポップアップ用。時間外は知らせない（受信箱にはある）。 */
export async function GET() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  await syncFromTeamsIfStale(db);
  return Response.json({ notices: isNoticeHours(new Date()) ? listReplyNotices(db, viewer.id) : [] });
}

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { replyIds?: unknown } | null;
  const ids = Array.isArray(input?.replyIds) ? input.replyIds.filter((id): id is string => typeof id === "string") : [];
  const { viewer } = await getViewer();
  markRepliesSeen(getDatabase(), viewer.id, ids);
  return Response.json({ ok: true });
}
