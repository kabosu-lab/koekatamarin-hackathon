"use client";

import { createContext, type ReactNode, useContext, useRef, useState } from "react";

type Filter = { selected: string | null; fading: boolean; choose(channelId: string | null): void };

const FilterContext = createContext<Filter>({ selected: null, fading: false, choose: () => {} });

/** 設計書 §2-2-4：一覧は 80ms で消え、並べ替えて 160ms で出る。カードを飛ばして動かさない */
const OUT_MS = 80;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** チャネルの札で投稿を絞る。札（帯の下）と投稿の一覧（その下）が同じ選択を見る */
export function ChannelFilter({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const choose = (channelId: string | null) => {
    window.clearTimeout(timer.current);
    if (reducedMotion()) {
      setSelected(channelId);
      return;
    }
    setFading(true);
    timer.current = window.setTimeout(() => {
      setSelected(channelId);
      setFading(false);
    }, OUT_MS);
  };
  return <FilterContext.Provider value={{ selected, fading, choose }}>{children}</FilterContext.Provider>;
}

/** 帯のすぐ下の札の列。押すとそのチャネルの投稿に絞る。横に動かしても画面は移らない */
export function ChannelChips({ channels }: { channels: { id: string; name: string }[] }) {
  const { selected, choose } = useContext(FilterContext);
  if (channels.length < 2) return null;
  return (
    <div className="minna-chips" role="group" aria-label="チャネルで絞る" data-noswipe>
      {[{ id: null, name: "すべて" }, ...channels].map((channel) => (
        <button
          key={channel.id ?? "all"}
          type="button"
          className="minna-chip"
          aria-pressed={selected === channel.id}
          onClick={() => choose(channel.id)}
        >
          {channel.name}
        </button>
      ))}
    </div>
  );
}

/** 投稿の一覧。絞り込みの間だけ薄くする */
export function FilteredList({ children, label }: { children: ReactNode; label: string }) {
  const { fading } = useContext(FilterContext);
  return (
    <ul className="minna-post-list" aria-label={label} data-fading={fading ? "true" : undefined}>
      {children}
    </ul>
  );
}

/** 選んだチャネルでなければ隠す */
export function FilteredItem({ channelId, children }: { channelId: string; children: ReactNode }) {
  const { selected } = useContext(FilterContext);
  return <li hidden={selected !== null && selected !== channelId}>{children}</li>;
}
