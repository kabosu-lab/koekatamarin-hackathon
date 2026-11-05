"use client";

import Link from "next/link";
import { type ReactNode, useRef } from "react";
import { ClickWheel } from "./ClickWheel";
import { Icon, type IconName } from "./Icon";

const WHEEL_PIXELS_PER_DEGREE = 2.2;

type SideLink = { href: string; label: string; icon: IconName };

/** みんなと、履歴と設定の外枠。話す画面と同じ本体、窓、ホイール、左右の入口。中身は窓の中で動く。 */
export function DeviceFrame({
  label,
  left,
  right,
  dot,
  children,
}: {
  label: string;
  left: SideLink;
  right: SideLink;
  /** 3枚のうちの何枚目か */
  dot: 0 | 2;
  children: ReactNode;
}) {
  const windowRef = useRef<HTMLElement>(null);
  const side = (link: SideLink) => (
    <Link className="device-side" href={link.href}>
      <span className="device-side-face">
        <Icon name={link.icon} />
      </span>
      {link.label}
    </Link>
  );
  return (
    <div className="retro-home device-page">
      <div className="talk device" data-talking="true">
        <section className="lcd device-window" aria-label={label} ref={windowRef} data-noswipe-landscape>
          {children}
        </section>
        <div className="device-controls">
          {side(left)}
          <ClickWheel
            onRotate={(degrees) => {
              if (windowRef.current) windowRef.current.scrollTop += degrees * WHEEL_PIXELS_PER_DEGREE;
            }}
          >
            <Link className="device-mic" href="/">
              <Icon name="talk" />
              話す
            </Link>
          </ClickWheel>
          {side(right)}
        </div>
        <nav className="swipe-mark" aria-label="画面の切り替え">
          {dot === 0 ? <span /> : <Link href="/">‹ 話す</Link>}
          <span className="swipe-dots" aria-hidden="true">
            <i data-current={dot === 0 ? "" : undefined} />
            <i />
            <i data-current={dot === 2 ? "" : undefined} />
          </span>
          {dot === 2 ? <span /> : <Link href="/">話す ›</Link>}
        </nav>
      </div>
    </div>
  );
}
