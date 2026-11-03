"use client";

import { useEffect, useMemo } from "react";
import { sendTiming, splitIntoWords } from "@/lib/lumps";

export { playSendSound } from "./sound";

const PETALS = [-120, -85, -50, -20, 20, 50, 85, 120];
/** 言葉が出る場所（中央からの横と縦のずれ）。順に上へ積み上がる */
const SPOTS: [string, string][] = [
  ["-24vw", "0rem"],
  ["20vw", "-2.6rem"],
  ["-16vw", "-5.2rem"],
  ["24vw", "-7.8rem"],
  ["-6vw", "-10.4rem"],
];

/** 話した言葉がぽ、ぽ、ぽぽ、ぽと出て固まり、文章の箱に入って開き、シューンと外へ飛んで、届くと花びらになる。動きを減らす設定では出さない（CSS）。 */
export function SendBurst({ words, onDone }: { words: string; onDone(): void }) {
  const pieces = useMemo(() => splitIntoWords(words), [words]);
  const timing = sendTiming(pieces.length);

  useEffect(() => {
    const timer = setTimeout(onDone, timing.end * 1000);
    return () => clearTimeout(timer);
  }, [onDone, timing.end]);

  const times = {
    "--gather": `${timing.gather}s`,
    "--enter": `${timing.enter}s`,
    "--open": `${timing.open}s`,
    "--launch": `${timing.launch}s`,
    "--land": `${timing.land}s`,
  } as React.CSSProperties;

  return (
    <div className="send-burst" aria-hidden="true" style={times}>
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="word"
          style={
            {
              "--x": SPOTS[index][0],
              "--y": SPOTS[index][1],
              "--delay": `${timing.wordTimes[index]}s`,
            } as React.CSSProperties
          }
        >
          {piece}
        </span>
      ))}
      <span className="blob" />
      <span className="draft-box">
        <span>{words}</span>
      </span>
      {PETALS.map((dx) => (
        <span key={dx} className="burst-petal" style={{ "--dx": `${dx}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}
