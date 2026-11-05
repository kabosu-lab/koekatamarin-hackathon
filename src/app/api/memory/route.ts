import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handleMemory } from "@/lib/memory";
import { keepsSpokenWords } from "@/lib/trial";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  // 生徒の試用では、話した言葉をサーバーに残さない（消すことはできる）
  if (!keepsSpokenWords() && (input as { action?: unknown } | null)?.action === "remember") {
    return Response.json({ error: "試用では覚えさせられません" }, { status: 403 });
  }
  const { viewer } = await getViewer();
  const { status, body } = handleMemory(getDatabase(), viewer.id, input);
  return Response.json(body, { status });
}
