"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "話す", also: ["/inbox", "/soudan"] },
  { href: "/minna", label: "みんな", also: ["/today", "/teams", "/study", "/people", "/nakama"] },
  { href: "/me", label: "じぶん", also: ["/daily", "/lookback"] },
];

function isCurrent(pathname: string, item: (typeof ITEMS)[number]): boolean {
  return pathname === item.href || item.also.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** 画面は3つだけ。ボタンには必ず文字を付ける。 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="画面の切り替え">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isCurrent(pathname, item) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
