import { attachmentHeaders, deletePending, readAttachment } from "@/lib/attachment";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";

type Context = { params: Promise<{ id: string }> };

/** 投稿と同じ範囲の人にだけ渡す。範囲の外の人には、あることも伝えない。 */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const { viewer } = await getViewer();
  const db = getDatabase();
  const row = readAttachment(db, getDestination(db), viewer.id, id);
  if (!row) return new Response("見つかりません", { status: 404 });
  return new Response(Buffer.from(row.data), { headers: attachmentHeaders(row) });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const { viewer } = await getViewer();
  return deletePending(getDatabase(), viewer.id, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "取り除けませんでした" }, { status: 404 });
}
