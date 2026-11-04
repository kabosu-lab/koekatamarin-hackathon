import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleGoals } from "@/lib/goals";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = handleGoals(getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
