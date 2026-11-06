"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** 桜の窓に知らせる期間限定のイベント（src/lib/events.ts の SchoolEvent のうち、画面に出す分） */
export type MegaphoneEvent = {
  id: string;
  name: string;
  message: string;
  start: string;
  end: string;
  ribbon: { name: string; description: string };
};

/** 「2026-11-01」→「11月1日」 */
function monthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

/**
 * 桜の木のそばの小さなメガホン（0-1y(4)）。イベントがあるときだけ置き、開いた直後に2回だけ小さく揺れ、
 * 「お知らせあり」の点を付ける。桜が帯に縮んでいるときは帯の右端に同じものを小さく出す。
 */
export function MegaphoneButton({ place, hidden, onOpen }: { place: "scene" | "band"; hidden: boolean; onOpen(): void }) {
  return (
    <button
      type="button"
      className="minna-megaphone"
      data-place={place}
      aria-label="期間限定のイベントのお知らせ"
      aria-haspopup="dialog"
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : 0}
      onClick={onOpen}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 10v4h3l7 4V6l-7 4H4Z M7 14l1.5 5h2.5l-1.4-4.2 M17 9.5a3.5 3.5 0 0 1 0 5 M19 7a7 7 0 0 1 0 10" />
      </svg>
      <span className="minna-megaphone-dot" aria-hidden="true" />
    </button>
  );
}

/** メガホンを押すと出る小さなカード。今のイベントを並べ、外を押すと閉じる */
export function EventPopup({ events, onClose }: { events: readonly MegaphoneEvent[]; onClose(): void }) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="minna-event-layer" data-noswipe>
      <div className="minna-event-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={card} className="minna-event-card" role="dialog" aria-label="期間限定のイベント" tabIndex={-1}>
        {events.map((event) => (
          <section key={event.id} className="minna-event-item" aria-label={event.name}>
            <strong>{event.name}</strong>
            <small>
              {monthDay(event.start)}〜{monthDay(event.end)}
            </small>
            <p>{event.message}</p>
            <p className="minna-event-ribbon">
              期間限定のトロフィー「{event.ribbon.name}」：{event.ribbon.description}と届きます
            </p>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
