import { createClaude } from "@/lib/claude";
import { handlePublish } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { awaitTeamsDelivery } from "@/lib/destination/teams-bridge";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handlePublish(createClaude(), getDestination(getDatabase()), viewer.id, input, getDatabase());
  // 本物の Teams に届いたかを、数秒だけ待って一緒に返す
  const postId = (body as { postId?: unknown }).postId;
  if (status === 200 && typeof postId === "string") {
    return Response.json({ ...body, teams: await awaitTeamsDelivery(postId) }, { status });
  }
  return Response.json(body, { status });
}
