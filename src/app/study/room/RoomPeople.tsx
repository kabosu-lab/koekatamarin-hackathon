"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { StudyMate } from "@/lib/study";

/** 名札は2〜3秒で消える（指を乗せている間は待つ） */
const TAG_MS = 3_000;

type Tag = { seat: number; x: number; y: number; below: boolean };

/**
 * 自習室のパートナーを押すと、そのパートナーが弾み、頭の上に小さな名札が出る（0-3f）。
 * 名札は名前・肩書・勉強している分だけ。押された側には何も知らせず、どこにも送らない。
 * 景色（RoomScene）は文字もボタンも持たないまま、押したところをここで受ける。
 * 「ほか N人」の札か奥の影の束を押すと、座りきれない人の名前の一覧が出る。
 */
export function RoomPeople({
  mates,
  seats,
  viewerId,
  children,
}: {
  /** 景色の並びと同じ順の人 */
  mates: StudyMate[];
  /** 景色に座っている人数（それより後ろは「ほか N人」） */
  seats: number;
  viewerId: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timer.current = setTimeout(() => setTag(null), TAG_MS);
  }, [stopTimer]);

  useEffect(() => stopTimer, [stopTimer]);

  // 外を押すと、名札も一覧も消える
  useEffect(() => {
    if (!tag && !listOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".room-tag, .room-list, .room-seat[data-seat], .room-shadows, .room-more")) return;
      setTag(null);
      setListOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [tag, listOpen]);

  function open(seatElement: HTMLElement) {
    const seat = Number(seatElement.dataset.seat);
    const frame = box.current?.closest<HTMLElement>(".room-frame");
    if (!frame || !mates[seat]) return;
    const area = frame.getBoundingClientRect();
    const rect = seatElement.getBoundingClientRect();
    // 上に名札の入る場所がなければ、下に出す
    const below = rect.top - area.top < 110;
    const x = Math.min(Math.max(rect.left + rect.width / 2 - area.left, 96), area.width - 96);
    setTag({ seat, x, y: below ? rect.bottom - area.top : rect.top - area.top, below });
    setListOpen(false);
    // 弾む（動きを減らす設定では CSS が動かさない）
    seatElement.classList.remove("is-poked");
    void seatElement.offsetWidth;
    seatElement.classList.add("is-poked");
    startTimer();
  }

  function onClick(event: React.MouseEvent) {
    const target = event.target as Element;
    const seat = target.closest<HTMLElement>(".room-seat[data-seat]");
    if (seat) return open(seat);
    if (target.closest(".room-shadows")) {
      setTag(null);
      setListOpen((value) => !value);
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const seat = (event.target as Element).closest<HTMLElement>(".room-seat[data-seat]");
    if (!seat) return;
    event.preventDefault();
    open(seat);
  }

  const mate = tag ? mates[tag.seat] : null;
  const others = mates.slice(seats);

  return (
    <div ref={box} className="room-people" onClick={onClick} onKeyDown={onKeyDown}>
      {children}
      {others.length > 0 && (
        <button
          type="button"
          className="room-chip room-more"
          aria-expanded={listOpen}
          onClick={(event) => {
            event.stopPropagation();
            setTag(null);
            setListOpen((value) => !value);
          }}
        >
          ほか {others.length}人
        </button>
      )}
      {listOpen && (
        <div className="room-list" role="dialog" aria-label="ほかに勉強している人">
          <ul>
            {others.map((other, index) => (
              <li key={index}>
                <strong>{other.name}</strong>
                {other.label && <span>{other.label}</span>}
              </li>
            ))}
          </ul>
          <button type="button" className="room-list-close" onClick={() => setListOpen(false)}>
            とじる
          </button>
        </div>
      )}
      {tag && mate && (
        <div
          className="room-tag"
          data-below={tag.below}
          role="status"
          style={{ left: tag.x, top: tag.y }}
          onPointerEnter={stopTimer}
          onPointerLeave={startTimer}
        >
          <strong className="room-tag-name">{mate.id === viewerId ? `${mate.name}（じぶん）` : mate.name}</strong>
          {mate.label && <span className="room-tag-label">{mate.label}</span>}
          <span className="room-tag-time">{mate.minutes}分 勉強中</span>
        </div>
      )}
    </div>
  );
}
