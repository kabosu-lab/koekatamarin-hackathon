"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const ITEMS: { href: string; label: string; icon: IconName; also: string[] }[] = [
  // ログはレトロでだけ出す（retro.css）。ほかの見た目の画面は3つのまま
  { href: "/log", label: "ログ", icon: "write", also: [] },
  { href: "/", label: "話す", icon: "talk", also: ["/inbox", "/soudan", "/walk"] },
  { href: "/minna", label: "みんな", icon: "people", also: ["/today", "/teams", "/study", "/people", "/chie"] },
  { href: "/me", label: "じぶん", icon: "me", also: ["/daily", "/lookback", "/yousu"] },
];

function isCurrent(pathname: string, item: (typeof ITEMS)[number]): boolean {
  return pathname === item.href || item.also.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** 画面は3つだけ。アイコンには必ず文字を付ける。 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="画面の切り替え">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} data-tab={item.href} aria-current={isCurrent(pathname, item) ? "page" : undefined}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
