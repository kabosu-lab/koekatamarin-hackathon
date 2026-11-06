"use client";

import { useCallback, useRef, useState } from "react";
import { hz } from "@/lib/send-sound";
import { audioOutput } from "./sound";

/**
 * パートナーをタップしたときの反応（0-2a）。動きを選ぶ純粋な関数と、「ぽよ」の音と、本体がつなぐための小さなフック。
 * 動き自体は partner-tap.css が `[data-react="..."]` で付ける（transform と opacity だけ）。
 */

export type TapReaction = "bounce" | "squash" | "blink" | "wiggle" | "dizzy";

/** ふだん回す動き。dizzy は強く何度も押したときだけの小さなお楽しみ */
export const TAP_REACTIONS: readonly TapReaction[] = ["bounce", "squash", "blink", "wiggle"];

/** この回数を短い間に続けて押したら、目を回す（1回だけ） */
export const DIZZY_TAPS = 6;
/** 「続けて押した」とみなす間隔（ms） */
export const RAPID_GAP_MS = 400;

/**
 * 次の動き。直前と同じものは返さない。
 * tapIndex で順に回し（毎回少しずつ違う）、続けて DIZZY_TAPS 回押したときだけ dizzy。
 */
export function nextReaction(previous: TapReaction | null, tapIndex: number, rapidTaps = 1): TapReaction {
  if (rapidTaps === DIZZY_TAPS && previous !== "dizzy") return "dizzy";
  const n = Math.max(0, Math.floor(tapIndex));
  // 1周ごとに並びを少しずらす（bounce → squash → blink → wiggle → squash → wiggle → ...）
  const stride = Math.floor(n / TAP_REACTIONS.length) % 2 === 0 ? 1 : 3;
  for (let step = 0; step < TAP_REACTIONS.length; step++) {
    const candidate = TAP_REACTIONS[(n * stride + step) % TAP_REACTIONS.length];
    if (candidate !== previous) return candidate;
  }
  return "bounce";
}

/** 続けて押した回数を数える（前のタップから RAPID_GAP_MS 以内なら続き） */
export function countRapid(previousAt: number | null, now: number, previousCount: number): number {
  if (previousAt === null || now - previousAt > RAPID_GAP_MS) return 1;
  return previousCount + 1;
}

/** ぽよの高さ（ハ長調のペンタトニック、低め）。押すたびに順に変わる */
const POYO_NOTES = [60, 62, 64, 67, 69];

/**
 * 小さな「ぽよ」。木琴の仲間の FM だが、低めの音域で、出だしに下から持ち上がる揺れを付けて丸くする。
 * カリ（雑音）・ポン（高めで揺れない）・和音とは別に聞こえるように。短く小さく。
 */
export function schedulePoyo(audio: BaseAudioContext, out: AudioNode, at: number, note: number, volume = 0.12): void {
  const frequency = hz(note);
  const carrier = audio.createOscillator();
  carrier.type = "sine";
  // 「ぽ」：下から持ち上がる → 「よ」：わずかに行き過ぎて落ち着く
  carrier.frequency.setValueAtTime(frequency * 0.82, at);
  carrier.frequency.linearRampToValueAtTime(frequency * 1.06, at + 0.04);
  carrier.frequency.setTargetAtTime(frequency, at + 0.04, 0.03);

  const modulator = audio.createOscillator();
  modulator.frequency.value = frequency * 2;
  const depth = audio.createGain();
  depth.gain.setValueAtTime(0.8 * frequency, at);
  depth.gain.setTargetAtTime(0, at, 1 / 40);
  modulator.connect(depth).connect(carrier.frequency);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.006);
  gain.gain.setTargetAtTime(0, at + 0.006, 1 / 22);
  carrier.connect(gain).connect(out);

  for (const tone of [carrier, modulator]) {
    tone.start(at);
    tone.stop(at + 0.2);
  }
}

/** ぽよを鳴らす。step で高さが順に変わる（dizzy のときは3音を下りながら） */
export function playPoyo(step = 0, reaction: TapReaction | null = null): void {
  const output = audioOutput();
  if (!output) return;
  const { audio, out } = output;
  try {
    const start = audio.currentTime + 0.02;
    if (reaction === "dizzy") {
      [67, 64, 60].forEach((note, i) => schedulePoyo(audio, out, start + i * 0.07, note, 0.09));
      return;
    }
    const n = Math.max(0, Math.floor(step));
    schedulePoyo(audio, out, start, POYO_NOTES[n % POYO_NOTES.length]);
  } catch {
    // 音が出せなくても、触った手応えは動きで出る
  }
}

/**
 * 本体がつなぐためのフック。onTap を呼ぶと、動きを選び、ぽよを鳴らし、data-react に入れる値を返す。
 * talking（会話が始まったあと）は、弾むだけ（0-2a (5)）。
 * 動きが終わったら onAnimationEnd で消す（次のタップで同じ動きでもまた動くように）。
 */
export function usePartnerTap(talking: boolean) {
  const [reaction, setReaction] = useState<TapReaction | null>(null);
  const state = useRef({ index: 0, previous: null as TapReaction | null, lastAt: null as number | null, rapid: 0 });

  const onTap = useCallback(() => {
    const s = state.current;
    const now = performance.now();
    s.rapid = countRapid(s.lastAt, now, s.rapid);
    s.lastAt = now;
    const next = talking ? "bounce" : nextReaction(s.previous, s.index, s.rapid);
    playPoyo(s.index, next);
    s.index += 1;
    s.previous = next;
    // 同じ動きが続く（会話のあとの弾む）ときも動き直すよう、一度外してから付ける
    setReaction(null);
    requestAnimationFrame(() => setReaction(next));
    return next;
  }, [talking]);

  const onAnimationEnd = useCallback((event: { target: EventTarget; currentTarget: EventTarget }) => {
    if (event.target === event.currentTarget) setReaction(null);
  }, []);

  return { reaction, onTap, onAnimationEnd };
}
