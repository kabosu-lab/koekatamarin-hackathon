import { isPose, renderArt } from "@/lib/avatar-art";
import { getDatabase } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; pose: string }> }) {
  const { token, pose } = await params;
  const svg = isPose(pose) ? renderArt(getDatabase(), token, pose) : null;
  if (!svg) return new Response("見つかりません", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-cache",
    },
  });
}
