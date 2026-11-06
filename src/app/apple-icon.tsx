import { ImageResponse } from "next/og";
import { companionColor, lumpMarkup } from "@/lib/companion-art";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iPhone のホーム画面のアイコン（apple-touch-icon）。絵は icon.tsx と同じパートナー（0-2e） */
export default function AppleIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${lumpMarkup(companionColor(null))}</svg>`;
  const art = Math.round(size.width * 0.78);
  return new ImageResponse(
    (
      // 透けた所は iOS で黒くなるので、レトロの外枠の色を敷く。角は iOS が丸める
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(175deg, #e9ebee, #d3d7dc)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" width={art} height={art} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} />
      </div>
    ),
    size,
  );
}
