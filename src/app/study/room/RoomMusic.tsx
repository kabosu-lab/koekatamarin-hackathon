"use client";

import { useEffect, useRef, useState } from "react";
import { beatAt, notesForBeat, type RoomMusic as Music, trackOf } from "@/lib/room-music";

const POLL_MS = 20_000;
const LOOKAHEAD_S = 1.5;
const VOLUME = 0.05;

const pitch = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function tone(audio: AudioContext, out: AudioNode, midi: number, at: number, length: number, level: number) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = pitch(midi);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + Math.min(0.4, length / 3));
  gain.gain.linearRampToValueAtTime(0, at + length);
  oscillator.connect(gain).connect(out);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

/** 部屋に流れる曲。全員が同じ曲の同じ位置を聴く。音を出すかは一人ずつ選び、初めは出さない。 */
export function RoomMusic({ initial }: { initial: Music }) {
  const [music, setMusic] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const offset = useRef(initial.serverNow - Date.now());
  const trackId = useRef(initial.trackId);
  const lastBeat = useRef(-1);

  const apply = (next: Music) => {
    offset.current = next.serverNow - Date.now();
    trackId.current = next.trackId;
    setMusic(next);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      void fetch("/api/room-music")
        .then((response) => response.json() as Promise<Music>)
        .then(apply)
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!playing) return;
    // 本人が押してから音を作る（ブラウザの決まりでもある）
    const audio = new AudioContext();
    audioRef.current = audio;
    const out = audio.createGain();
    out.gain.value = 1;
    out.connect(audio.destination);
    const schedule = () => {
      const track = trackOf(trackId.current);
      const beatMs = 60_000 / track.bpm;
      const serverMs = Date.now() + offset.current;
      const first = Math.max(beatAt(track, serverMs) + 1, lastBeat.current + 1);
      const last = beatAt(track, serverMs + LOOKAHEAD_S * 1000);
      for (let beat = first; beat <= last; beat += 1) {
        const at = audio.currentTime + (beat * beatMs - serverMs) / 1000;
        const { chord, melody } = notesForBeat(track, beat);
        if (chord) for (const midi of chord) tone(audio, out, midi, at, (beatMs * 8) / 1000, VOLUME);
        if (melody !== null) tone(audio, out, melody, at, (beatMs * 2) / 1000, VOLUME * 1.2);
        lastBeat.current = beat;
      }
    };
    schedule();
    const timer = setInterval(schedule, 500);
    return () => {
      clearInterval(timer);
      lastBeat.current = -1;
      void audio.close();
      audioRef.current = null;
    };
  }, [playing]);

  return (
    <section className="room-music" aria-label="みんなで聴く曲">
      <p>
        <strong>いまの曲：{music.name}</strong>
        <small>みんなで同じ曲を聴きます。音は自分だけ消せます</small>
      </p>
      <div className="row">
        <button type="button" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>
          {playing ? "音を止める" : "音を聴く"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!music.canChange}
          onClick={() =>
            void fetch("/api/room-music", { method: "POST" })
              .then((response) => response.json() as Promise<Music>)
              .then(apply)
              .catch(() => undefined)
          }
        >
          {music.canChange ? "曲を変える" : "少し待つと変えられます"}
        </button>
      </div>
    </section>
  );
}
