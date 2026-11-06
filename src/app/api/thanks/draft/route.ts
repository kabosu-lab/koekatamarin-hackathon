import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { draftThanksFromWords } from "@/lib/thanks-people";

/** パートナーに話した言葉（「〇〇先生にありがとうって伝えたい」）から、サンクスカードの下書きを作る。送りはしない */
export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof input?.text === "string" ? input.text.slice(0, 500) : "";
  if (text.trim() === "") return Response.json({ error: "言葉が空です" }, { status: 400 });
  const { viewer } = await getViewer();
  return Response.json({ draft: draftThanksFromWords(getDatabase(), viewer.id, text) });
}
