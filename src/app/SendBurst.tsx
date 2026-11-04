"use client";

import { useEffect, useMemo, useRef } from "react";
import { lumpFrames, sendTiming, speakerFrames, splitIntoWords, trailFrames } from "@/lib/lumps";
import { Avatar } from "./Avatar";

export { playSendSound } from "./sound";

const PETALS = [-120, -85, -50, -20, 20, 50, 85, 120];
const TRAILS = [0, 1, 2, 3];
/** 言葉が出る場所（かたまりからの横と縦のずれ） */
const SPOTS: [string, string][] = [
  ["-20vw", "-3.5rem"],
  ["20vw", "-5rem"],
  ["-16vw", "-9rem"],
  ["18vw", "-10.5rem"],
  ["0vw", "-13rem"],
];

/**
 * 話した言葉が少しずつ固まり、固まる速さが加速して、ためてからヒューンと飛び、届くと花びらになる。
 * 動きを減らす設定では出さない（CSS）。
 */
export function SendBurst({ words, avatarImage, onDone }: { words: string; avatarImage?: string; onDone(): void }) {
  const pieces = useMemo(() => splitIntoWords(words), [words]);
  const timing = useMemo(() => sendTiming(pieces.length), [pieces.length]);
  const lump = useRef<HTMLSpanElement>(null);
  const speaker = useRef<HTMLSpanElement>(null);
  const trails = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const timer = setTimeout(onDone, timing.end * 1000);
    return () => clearTimeout(timer);
  }, [onDone, timing.end]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { innerWidth: width, innerHeight: height } = window;
    const animations = [
      lump.current?.animate(lumpFrames(timing, width, height), { duration: timing.land * 1000, fill: "forwards" }),
      speaker.current?.animate(speakerFrames(timing), { duration: timing.end * 1000, fill: "forwards" }),
      ...trails.current.map((trail, order) => {
        const { frames, delay, duration } = trailFrames(timing, width, height, order);
        return trail?.animate(frames, { delay: delay * 1000, duration: duration * 1000, fill: "both", easing: "linear" });
      }),
    ];
    return () => animations.forEach((animation) => animation?.cancel());
  }, [timing]);

  const times = {
    "--land": `${timing.land}s`,
    "--end": `${timing.end}s`,
  } as React.CSSProperties;

  return (
    <div className="send-burst" aria-hidden="true" style={times}>
      <div className="burst-stage">
        {avatarImage && (
          <span className="burst-speaker" ref={speaker}>
            <Avatar image={avatarImage} alt="" size={168} />
          </span>
        )}
        {TRAILS.map((order) => (
          <span
            key={order}
            className="burst-trail"
            ref={(element) => {
              trails.current[order] = element;
            }}
          />
        ))}
        <span className="blob" ref={lump} />
        {pieces.map((piece, index) => (
          <span
            key={index}
            className="word"
            style={
              {
                "--x": SPOTS[index][0],
                "--y": SPOTS[index][1],
                "--delay": `${timing.wordTimes[index]}s`,
                "--duration": `${timing.wordDurations[index]}s`,
              } as React.CSSProperties
            }
          >
            {piece}
          </span>
        ))}
      </div>
      {PETALS.map((dx) => (
        <span key={dx} className="burst-petal" style={{ "--dx": `${dx}px` } as React.CSSProperties} />
      ))}
      <span className="burst-reached">届いた！</span>
    </div>
  );
}
