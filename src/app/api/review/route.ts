import { createClaude } from "@/lib/claude";
import { handleReview } from "@/lib/compose-request";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { status, body } = await handleReview(createClaude(), input);
  return Response.json(body, { status });
}
