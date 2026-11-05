"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** 奥の画面の一番下に使う人の切り替えを出す。話す画面には出さず、履歴と設定では窓の中に置く。 */
export function GlobalSwitcher({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return pathname === "/" || pathname === "/me" ? null : children;
}
