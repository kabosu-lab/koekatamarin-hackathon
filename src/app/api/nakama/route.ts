import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";
import { handleNakama } from "@/lib/nakama";

export async function POST() {
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = await handleNakama(createClaude(), db, createDummyTeams(db), viewer.id);
  return Response.json(body, { status });
}
