import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // スマホの実機で開発中の画面を確かめるときに、Mac の IP アドレスを指定する
  allowedDevOrigins: process.env.KOEKATA_DEV_ORIGIN ? [process.env.KOEKATA_DEV_ORIGIN] : [],
};

export default nextConfig;
