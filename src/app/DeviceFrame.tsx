"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * みんなと、履歴と設定の外枠。話す画面と同じ本体と窓。中身は窓の中で動く。
 * 話すボタンとホイールは「話す」画面だけに置き、ここでは下まで中身に使う（0-1f）。
 */
export function DeviceFrame({
  label,
  dot,
  screen,
  children,
}: {
  label: string;
  /** 3枚のうちの何枚目か */
  dot: 0 | 2;
  /** 上の窓に出す絵。あるときは、中身を窓の下に広げて読みやすくする */
  screen?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="retro-home device-page">
      <div className="talk device" data-talking="true">
        {screen ? (
          <>
            <div className="lcd device-screen">{screen}</div>
            <section className="device-body device-window" aria-label={label} data-noswipe-landscape>
              {children}
            </section>
          </>
        ) : (
          <section className="lcd device-window" aria-label={label} data-noswipe-landscape>
            {children}
          </section>
        )}
        <nav className="swipe-mark" aria-label="画面の切り替え">
          {/* 3枚は輪になっている。端の先は反対の端へ */}
          {dot === 0 ? <Link href="/minna">‹ みんな</Link> : <Link href="/">‹ 話す</Link>}
          <span className="swipe-dots" aria-hidden="true">
            <i data-current={dot === 0 ? "" : undefined} />
            <i />
            <i data-current={dot === 2 ? "" : undefined} />
          </span>
          {dot === 2 ? <Link href="/me">履歴と設定 ›</Link> : <Link href="/">話す ›</Link>}
        </nav>
      </div>
    </div>
  );
}
