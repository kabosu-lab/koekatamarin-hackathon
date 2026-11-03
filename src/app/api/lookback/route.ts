import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleLookback } from "@/lib/lookback";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleLookback(createClaude(), getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
