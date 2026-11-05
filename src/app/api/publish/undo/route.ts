import { handleUndo } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = handleUndo(getDestination(db), viewer.id, input, new Date(), db);
  return Response.json(body, { status });
}
