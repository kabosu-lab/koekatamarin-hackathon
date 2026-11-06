import { createClaude } from "@/lib/claude";
import { prepareDraftStream } from "@/lib/compose-request";
import { getViewer } from "@/lib/current-person";
import { getDatabase } from "@/lib/db";
import { getDestination } from "@/lib/destination/current";

/** 0-2l：下書きを流しながら返す。1行に1つの JSON（start → channel・delta → draft → review、失敗は error）。 */
export async function POST(request: Request) {
  const input: unknown = await request.json().catch(() => null);
  const { viewer } = await getViewer();
  const prepared = prepareDraftStream(createClaude(), getDestination(getDatabase()), viewer.id, input, getDatabase());
  if (prepared.status !== 200) return Response.json(prepared.body, { status: prepared.status });

  const encoder = new TextEncoder();
  // 画面が読むのをやめたら（閉じた・取り消した）、Claude の呼び出しも止める
  const stop = new AbortController();
  request.signal.addEventListener("abort", () => stop.abort(), { once: true });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      await prepared.run((event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // 画面が閉じられたら、残りは捨てる
          open = false;
          stop.abort();
        }
      }, stop.signal);
      if (open && !stop.signal.aborted) controller.close();
    },
    cancel() {
      stop.abort();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
