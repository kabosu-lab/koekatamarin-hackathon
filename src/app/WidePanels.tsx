"use client";

import { useEffect, useState } from "react";

const WIDE = "(min-width: 1100px) and (min-height: 561px)";

/** 広い画面では、話す画面の左右に同じ画面を並べる。欄の中のリンクは欄の中で動き、真ん中の機器は保たれる。 */
export function WidePanel({ src, title }: { src: string; title: string }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (!wide) return null;
  return <iframe className="wide-panel" src={src} title={title} />;
}

/** 欄の中で開かれた画面に印を付ける。外枠を隠して中身だけを見せる。 */
export function EmbedMark() {
  useEffect(() => {
    if (window.self !== window.top) document.documentElement.dataset.embed = "true";
  }, []);
  return null;
}
