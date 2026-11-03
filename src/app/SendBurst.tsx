"use client";

import { useEffect } from "react";

const DURATION_MS = 2200;
const PETALS = [-70, -40, -15, 15, 40, 70];

/** 話した言葉がかたまりになって飛び、届くと桜の花びらになる。動きを減らす設定では出さない（CSS）。 */
export function SendBurst({ words, onDone }: { words: string; onDone(): void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="send-burst" aria-hidden="true">
      <span className="blob">{words}</span>
      {PETALS.map((dx) => (
        <span key={dx} className="burst-petal" style={{ "--dx": `${dx}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}

/** 送ったときの小さな音。「音あり」を選んだ人にだけ鳴らす。 */
export function playSendSound(): void {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
    gain.connect(audio.destination);
    [660, 880].forEach((frequency, index) => {
      const tone = audio.createOscillator();
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(audio.currentTime + index * 0.1);
      tone.stop(audio.currentTime + 0.5);
    });
  } catch {
    // 音が出せなくても、送るのには関係ない
  }
}
