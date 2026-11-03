import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { handlePass } from "@/lib/inbox";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = handlePass(db, createDummyTeams(db), viewer.id, input);
  return Response.json(body, { status });
}
