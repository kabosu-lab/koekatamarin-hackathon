import type { MetadataRoute } from "next";

/** ホーム画面に追加して、URL の帯なしで開くための設定（0-2e）。色はレトロ（生徒の初期）の外枠に合わせる */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "こえかた",
    short_name: "こえかた",
    description: "話すだけで、できることが増える。",
    start_url: "/",
    display: "standalone",
    // 0-2y (5)：iPhone は縦向きだけで使う（iPad とパソコンは画面の向きに合わせて使える）
    orientation: "portrait",
    theme_color: "#e9ebee",
    background_color: "#f3f5f7",
    icons: [
      { src: "/icon1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
