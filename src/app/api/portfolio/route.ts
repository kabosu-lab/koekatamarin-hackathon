import { cookies } from "next/headers";
import { readAppearance } from "@/lib/appearance";
import { createClaude } from "@/lib/claude";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { handlePortfolio } from "@/lib/portfolio";
import { showsRewards } from "@/lib/rewards-view";

export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const store = await cookies();
  const rewards = showsRewards(readAppearance((name) => store.get(name)?.value));
  const { status, body } = await handlePortfolio(createClaude(), getDatabase(), viewer.id, input, { rewards });
  return Response.json(body, { status });
}
