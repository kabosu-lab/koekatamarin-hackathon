import type { NextConfig } from "next";

// 一時公開の URL は固定できないので、外から渡す。例：*.trycloudflare.com（カンマで複数）
const allowedOrigins = (process.env.KOEKATA_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // 画面の下に重なる開発用の表示を出さない（撮影と確かめるときの邪魔になる）
  devIndicators: false,
  // Teams のタブに置く画面だけ、Teams の中に埋め込めるようにする（docs/teams-tab.md）
  async headers() {
    const value = "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://teams.cloud.microsoft https://*.office.com";
    return ["/tab"].map((source) => ({ source, headers: [{ key: "Content-Security-Policy", value }] }));
  },
  // スマホの実機で開発中の画面を確かめるときに、Mac の IP アドレスを指定する
  allowedDevOrigins: process.env.KOEKATA_DEV_ORIGIN ? [process.env.KOEKATA_DEV_ORIGIN] : [],
  ...(allowedOrigins.length > 0 ? { experimental: { serverActions: { allowedOrigins } } } : {}),
};

export default nextConfig;
