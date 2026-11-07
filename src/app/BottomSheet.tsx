"use client";

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useLift, useLiftMode } from "./column-lift";
import "./bottom-sheet.css";

type Props = {
  open: boolean;
  /** 下へなでおろす・暗い所を押す・Esc で呼ばれる。中身（下書き）は消さない */
  onClose(): void;
  /** 読み上げ用の名前 */
  label: string;
  children: ReactNode;
  /** 下に固定するボタン列。中身が長くても、いつも見える */
  footer?: ReactNode;
};

/** なでおろして閉じる距離（px）と速さ（px/ms） */
const CLOSE_DISTANCE = 80;
const CLOSE_SPEED = 0.5;
/** 閉じる動き（ease-in 180ms）を待ってから隠す */
const EXIT_MS = 180;

/**
 * 下からせり上がるシート（設計書 §2-6）。
 * 閉じても中身はそのまま持ち続けるので、もう一度開くと書きかけが残っている。
 */
export function BottomSheet({ open, onClose, label, children, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  // 閉じる動きが終わるまでは見せておき、終わったら隠す
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // 隠していた状態から出すときは、表示した次のコマで「開く」にする（同じコマだとせり上がりが走らない）
  const [entered, setEntered] = useState(open);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (open || !shown) return;
    const timer = window.setTimeout(() => setShown(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, shown]);

  // 0-3m：3列のときは、3列の上に全画面で（column-lift.ts）。出ている間（閉じる動きの間も）だけ上げる
  const lift = useLiftMode();
  const liftRef = useRef<HTMLDialogElement>(null);
  const lifted = lift && shown;
  useLift(lifted);
  useEffect(() => {
    const dialog = liftRef.current;
    if (!dialog) return;
    if (lifted && !dialog.open) dialog.showModal();
    else if (!lifted && dialog.open) dialog.close();
  }, [lifted]);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    setDragY(0);
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!open || (event.pointerType === "mouse" && event.button !== 0)) return;
    drag.current = { id: event.pointerId, y: event.clientY, t: performance.now(), dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    // 上へは引っぱれない
    const dy = Math.max(0, event.clientY - current.y);
    current.dy = dy;
    setDragY(dy);
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDragY(0);
    const speed = current.dy / Math.max(1, performance.now() - current.t);
    if (current.dy > CLOSE_DISTANCE || (current.dy > 16 && speed > CLOSE_SPEED)) onClose();
  }

  const sheet = (
    <div className="bottom-sheet" data-state={open && entered ? "open" : "closed"} hidden={!open && !shown} inert={!open}>
      <div className="bottom-sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="bottom-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-dragging={dragging ? "true" : undefined}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div className="bottom-sheet-grip" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <button type="button" className="bottom-sheet-handle" aria-label="閉じる（書いたものは残ります）" onClick={onClose} />
        </div>
        <div className="bottom-sheet-body">{children}</div>
        {footer && <div className="bottom-sheet-footer">{footer}</div>}
      </div>
    </div>
  );
  if (!lift) return sheet;
  // 0-3m：3列のときは、3列の上に全画面でせり上がる。最上層の <dialog> に入れ、裏は暗幕と inert（column-lift.ts）
  return (
    <dialog
      ref={liftRef}
      className="sheet-lift"
      onCancel={(event) => {
        // Esc は上の見張りが閉じる（dialog 自身には閉じさせない）
        event.preventDefault();
      }}
      onClose={() => {
        // それでもブラウザが台を閉じたときは、シートも閉じる（開いたまま見えなくならないように）
        if (open) closeRef.current();
      }}
    >
      {sheet}
    </dialog>
  );
}
