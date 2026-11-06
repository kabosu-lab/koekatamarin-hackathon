"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "koekata-room-hint-seen";
const SHOW_MS = 5_000;

/** 説明の一文は、最初に開いた1回だけ景色の上に出して消す（0-2s (3)）。見出しは「自習室」の1行にする。 */
export function RoomHint({ text }: { text: string }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 覚えておけない端末では、毎回出しても困らない
    }
    setShown(true);
    const timer = setTimeout(() => setShown(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!shown) return null;
  return <p className="room-hint">{text}</p>;
}
