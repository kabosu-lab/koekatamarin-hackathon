import { ImageResponse } from "next/og";
import { companionColor, lumpMarkup } from "@/lib/companion-art";

// Windows では部品の Icon.tsx と名前がぶつかるので、番号つきの icon1 にする（道は /icon1）
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** ホーム画面のアイコン。パートナー（声のかたまり）の絵を、外のファイルを読まずにその場で描く（0-2e） */
export default function Icon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${lumpMarkup(companionColor(null))}</svg>`;
  const art = Math.round(size.width * 0.78);
  return new ImageResponse(
    (
      // 透けた所は iOS で黒くなるので、レトロの外枠の色を敷く
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "linear-gradient(175deg, #e9ebee, #d3d7dc)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" width={art} height={art} src={`data:image/svg+xml,${encodeURIComponent(svg)}`} />
      </div>
    ),
    size,
  );
}
