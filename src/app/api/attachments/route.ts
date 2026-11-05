import { MAX_IMAGE_BYTES, saveAttachment } from "@/lib/attachment";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { readLimitedBody } from "@/lib/limited-body";

/** 添付1つの上限に、multipart の区切りのぶんを足した大きさ。 */
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  const raw = await readLimitedBody(request, MAX_REQUEST_BYTES);
  if (!raw) return Response.json({ error: "ファイルが大きすぎます（10MB まで）" }, { status: 413 });
  const headers = { "content-type": request.headers.get("content-type") ?? "" };
  const form = await new Response(raw, { headers }).formData().catch(() => null);
  const entries = form?.getAll("file").filter((entry): entry is File => entry instanceof File) ?? [];
  const files = await Promise.all(
    entries.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
  );
  const { viewer } = await getViewer();
  const { status, body } = saveAttachment(getDatabase(), viewer.id, files);
  return Response.json(body, { status });
}
