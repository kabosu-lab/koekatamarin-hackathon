import { isPose, renderArt } from "@/lib/avatar-art";
import { getDatabase } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; pose: string }> }) {
  const { token, pose } = await params;
  const art = isPose(pose) ? await renderArt(getDatabase(), token, pose) : null;
  if (!art) return new Response("見つかりません", { status: 404 });
  return new Response(art.body as BodyInit, {
    headers: {
      "Content-Type": art.contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-cache",
    },
  });
}
