"use client";

import { type PointerEvent, type ReactNode, useRef } from "react";
import { playWheelTick } from "./sound";

const TICK_DEGREES = 24;

/** 回すと液晶の中身が動くホイール。真ん中には大きなボタンを置く。回さなくても指で直接スクロールできる。 */
export function ClickWheel({ onRotate, children }: { onRotate(degrees: number): void; children: ReactNode }) {
  const last = useRef<number | null>(null);
  const turned = useRef(0);

  function angleOf(event: PointerEvent<HTMLDivElement>): number {
    const box = event.currentTarget.getBoundingClientRect();
    return (Math.atan2(event.clientY - box.top - box.height / 2, event.clientX - box.left - box.width / 2) * 180) / Math.PI;
  }

  return (
    <div
      className="click-wheel"
      data-noswipe
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        last.current = angleOf(event);
        turned.current = 0;
      }}
      onPointerMove={(event) => {
        if (last.current === null) return;
        const angle = angleOf(event);
        // -180 と 180 の境目をまたいでも、動いた分だけを数える
        const delta = ((angle - last.current + 540) % 360) - 180;
        last.current = angle;
        onRotate(delta);
        turned.current += Math.abs(delta);
        if (turned.current >= TICK_DEGREES) {
          turned.current = 0;
          playWheelTick();
        }
      }}
      onPointerUp={() => {
        last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
    >
      {children}
    </div>
  );
}
