import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";
import { handleWalkFinish } from "@/lib/walk";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const db = getDatabase();
  const { status, body } = await handleWalkFinish(createClaude(), db, getDestination(db), viewer.id, input);
  return Response.json(body, { status });
}
