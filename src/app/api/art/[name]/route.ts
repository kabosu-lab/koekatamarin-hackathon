import { loadArt } from "@/lib/art";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const art = await loadArt(name);
  if (!art) return new Response("見つかりません", { status: 404 });
  return new Response(art.body as BodyInit, {
    headers: { "Content-Type": art.contentType, "Cache-Control": "public, max-age=3600" },
  });
}
