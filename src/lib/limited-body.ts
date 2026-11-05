/**
 * 本文を上限まで読む。超えたら、その時点で読むのをやめて null を返す。
 * Content-Length は省けるので、実際に届いたバイト数で数える。
 */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
