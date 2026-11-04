import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { readAppearance } from "@/lib/appearance";
import { BottomNav } from "./BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "こえかた",
  description: "話すだけで、できることが増える。AI と仲間の力を借りて、もっと楽しく、もっと早く。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const { theme, size, sound } = readAppearance((name) => store.get(name)?.value);
  return (
    <html lang="ja" data-theme={theme} data-size={size} data-sound={sound}>
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
