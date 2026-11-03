"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "話す" },
  { href: "/minna", label: "みんな" },
  { href: "/me", label: "じぶん" },
];

/** 画面は3つだけ。ボタンには必ず文字を付ける。 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="画面の切り替え">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
