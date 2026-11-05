import { reachedTeams } from "@/lib/destination/teams-bridge";
import { handleUndo } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = handleUndo(getDestination(db), viewer.id, input, new Date(), db);
  const { postId } = (input ?? {}) as { postId?: unknown };
  // 本物の Teams に届いた分は、こえかたからは消せない。そのことを正直に伝える
  if (status === 200 && typeof postId === "string" && reachedTeams(db, postId)) {
    return Response.json({ ...body, teamsKept: true }, { status });
  }
  return Response.json(body, { status });
}
