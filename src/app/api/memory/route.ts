import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleMemory } from "@/lib/memory";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = handleMemory(getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
