import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { readAppearance } from "@/lib/appearance";
import { BottomNav } from "./BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "こえかた",
  description: "一人で抱えない。AI に話しかけるところから、人に頼れる学校へ。",
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
