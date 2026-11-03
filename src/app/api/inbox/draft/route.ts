import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleReplyDraft } from "@/lib/inbox";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const { status, body } = await handleReplyDraft(createClaude(), getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
