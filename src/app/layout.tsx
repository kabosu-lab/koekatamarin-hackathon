import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "コエカタ",
  description: "一人で抱えない。AI に話しかけるところから、人に頼れる学校へ。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
