"use client";

import { type PointerEvent, type ReactNode, useRef } from "react";

/**
 * なぞる輪。真ん中には大きなボタン（押し続けて話す）を置く。触った場所で分ける：
 * 輪から始めた指はなぞり（機能のチップを選ぶ、0-1g(3)）、真ん中から始めた指は話すボタンのもの。
 * カリの音はカルーセルの側で鳴らす（二重に鳴らさない）。
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
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        last.current = measure(event).angle;
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
      {children}
    </div>
  );
}
