import { handleEvolve } from "@/lib/avatar-evolve";
import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleEvolve(createClaude(), getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
