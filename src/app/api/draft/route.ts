import { createClaude } from "@/lib/claude";
import { handleDraft } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { createDummyTeams } from "@/lib/destination/dummy-teams";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleDraft(createClaude(), createDummyTeams(getDatabase()), viewer.id, input, getDatabase());
  return Response.json(body, { status });
}
