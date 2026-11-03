import { createClaude } from "@/lib/claude";
import { handleConnect } from "@/lib/connect";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = await handleConnect(createClaude(), db, createDummyTeams(db), viewer.id, input);
  return Response.json(body, { status });
}
