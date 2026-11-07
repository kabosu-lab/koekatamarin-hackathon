"use client";

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { hintPending, markHintSeen, reducedMotion, WHEEL_HINT_KEY, whenCalm } from "./first-hint";

/** 指の印が4分の1周なぞる長さ（CSS の .wheel-hint-finger と同じ） */
const HINT_MS = 1800;

/**
 * なぞる輪。真ん中には大きなボタン（押し続けて話す）を置く。触った場所で分ける：
 * 輪から始めた指はなぞり（機能のチップを選ぶ、0-1g(3)）、真ん中から始めた指は話すボタンのもの。
 * カリの音はカルーセルの側で鳴らす（二重に鳴らさない）。
 *
 * 0-3i：初めて開いたときだけ、
 * 指の形の小さな印が輪を4分の1周なぞる動きを1回見せる（動きを減らす設定では見せない）。印は指を受けない（目盛りの点は利用者の決定でなくした）。
 */
export function ClickWheel({
  invite = false,
  onRotate,
  onPoint,
  onRelease,
  onAbort,
  children,
}: {
  /** 押してほしい場所を、輪の呼吸で目で示す（0-1g(2)） */
  invite?: boolean;
  /** なぞった角度の差（度） */
  onRotate(degrees: number): void;
  /** 指の位置（輪の中心からの差と、輪とマイクの半径）。離すとやめる場所かを決めるのに使う */
  onPoint?(dx: number, dy: number, wheelRadius: number, micRadius: number): void;
  /** なぞったあとに指を離した */
  onRelease?(): void;
  /** なぞりが途中で切れた（画面が隠れたなど） */
  onAbort?(): void;
  children: ReactNode;
}) {
  const last = useRef<number | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (window.self !== window.top || !hintPending(WHEEL_HINT_KEY) || reducedMotion()) return;
    let timer = 0;
    // 端のつまみの棒の手ほどき（EdgeHandles）と重ならないよう、少し置いてから
    const stop = whenCalm(
      () => {
        markHintSeen(WHEEL_HINT_KEY);
        document.documentElement.dataset.wheelHint = "shown";
        setHint(true);
        timer = window.setTimeout(() => setHint(false), HINT_MS + 200);
      },
      { delayMs: 2600, limitMs: 20_000 },
    );
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, []);

  function measure(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - box.left - box.width / 2;
    const dy = event.clientY - box.top - box.height / 2;
    const mic = event.currentTarget.querySelector(".device-mic")?.getBoundingClientRect();
    return { dx, dy, wheelRadius: box.width / 2, micRadius: mic ? mic.width / 2 : 0, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  }

  return (
    <div
      className="click-wheel"
      data-noswipe
      data-invite={invite ? "breathe" : undefined}
      onPointerDown={(event) => {
        // 0-3n：真ん中のマイクから始めた指だけは話すボタンのもの。目盛り・指の印・縁など、ほかの子から始まっても輪のなぞり
        // （iPad の Safari では子が target になり、target === currentTarget のときだけ始める形ではまったく動かなかった）
        if (event.button > 0 || (event.target as Element).closest?.(".device-mic")) return;
        last.current = measure(event).angle;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // 捕まえられなくても、なぞりは続ける
        }
      }}
      onPointerMove={(event) => {
        if (last.current === null) return;
        const point = measure(event);
        // -180 と 180 の境目をまたいでも、動いた分だけを数える
        const delta = ((point.angle - last.current + 540) % 360) - 180;
        last.current = point.angle;
        onRotate(delta);
        onPoint?.(point.dx, point.dy, point.wheelRadius, point.micRadius);
      }}
      onPointerUp={() => {
        if (last.current === null) return;
        last.current = null;
        onRelease?.();
      }}
      onPointerCancel={() => {
        if (last.current === null) return;
        last.current = null;
        onAbort?.();
      }}
    >
      {hint && (
        <span className="wheel-hint" aria-hidden="true">
          <span className="wheel-hint-finger">
            <svg viewBox="0 0 24 24" width="100%" height="100%">
              <path
                d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10l.4-.1a1.5 1.5 0 0 1 2.6.6l.1.4.4-.1a1.5 1.5 0 0 1 2.4 1l.1.3a1.5 1.5 0 0 1 2.5 1.1V16a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7l-2.6-4a1.5 1.5 0 0 1 2.3-1.9L9 15z"
                fill="#fff"
                stroke="#2a3640"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      )}
      {children}
    </div>
  );
}
