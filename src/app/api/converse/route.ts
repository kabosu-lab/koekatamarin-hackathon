import { createClaude } from "@/lib/claude";
import { handleConverse } from "@/lib/claude/converse-request";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { status, body } = await handleConverse(createClaude(), input);
  return Response.json(body, { status });
}
