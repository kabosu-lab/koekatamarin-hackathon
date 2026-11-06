"use client";

import { useEffect, useRef } from "react";
import { useSmoothText } from "./use-smooth-text";

/**
 * 聞き取っている言葉の欄。文字を少しずつ出すための細かい描き直しを、この欄の中だけで行う（0-1i）。
 * 話す画面全体を 33ms ごとに描き直さない。
 */
export function HeardLine({ draft, heard }: { draft: string; heard: string }) {
  const shown = useSmoothText(heard);
  const ref = useRef<HTMLParagraphElement>(null);

  // 話している最新の行がいつも見えるよう、増えた分だけ上へ送る
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown]);

  return (
    <p className="device-heard" role="status" ref={ref}>
      <span className="listening-label">聞いています…</span>
      {draft && <span>{draft} </span>}
      {/* 新しく増えた文字だけが、ぼんやりから固まっていく */}
      {Array.from(shown).map((character, index) => (
        <span className="solidify" key={index}>
          {character}
        </span>
      ))}
    </p>
  );
}
