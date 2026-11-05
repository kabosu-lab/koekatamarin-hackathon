import { createClaude } from "@/lib/claude";
import { handleReview } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleReview(createClaude(), input, getDatabase(), viewer.id);
  return Response.json(body, { status });
}
