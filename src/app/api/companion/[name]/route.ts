import { companionSvg } from "@/lib/companion-art";

/** コードで描いた相棒の絵。名前は「系統-段階」で、知らないものは 404。 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const match = /^([a-z]+)-(\d{1,2})$/.exec(name);
  const svg = match ? companionSvg(match[1], Number(match[2])) : null;
  if (!svg) return new Response("not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
