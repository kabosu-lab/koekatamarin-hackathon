"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { audioOutput } from "@/app/sound";
import { THANKS_KINDS, THANKS_REVEAL_EVENT, type ThanksKind } from "@/lib/thanks-kind";
import { Icon } from "../Icon";
import { ThanksEntry } from "./ThanksCard";
import "./thanks-reveal.css";

export type RevealCard = {
  id: string;
  fromId: string;
  fromName: string;
  fromLabel: string;
  message: string;
  kind: ThanksKind;
  createdAt: string;
};

/** 封筒が飛んでくる → ふたが開く → カードがくるっと表を向く（設計書 §1 の時間） */
const FLY_MS = 520;
const OPEN_MS = 380;
const STASH_MS = 420;
const PETALS = 14;

type Phase = "fly" | "open" | "card" | "stash";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** やわらかい和音（ド・ミ・ソ・ド）。少しずつずらして重ねる。いちばん大きいところでも 0.6 より小さい */
function playSoftChord() {
  const output = audioOutput();
  if (!output) return;
  const { audio, out } = output;
  const start = audio.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const at = start + i * 0.07;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(i === 3 ? 0.06 : 0.12, at + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 1.7);
  });
}

/**
 * 0-3a：届いたサンクスカードを、話す画面で封筒から開けて見せる。
 * パートナーの「ありがとうが届いています」を押すと開く（THANKS_REVEAL_EVENT）。言葉はパートナーが読み上げない（本人が読む）。
 * 閉じるとカードは「履歴と設定」のカード帳（もらったありがとう）へ収まり、開封済みになる。
 */
export function ThanksReveal({ cards }: { cards: RevealCard[] }) {
  const router = useRouter();
  // 開いた時点のカードを持っておく（閉じたあとの読み直しで一覧が空になっても、見ている途中は消さない）
  const [queue, setQueue] = useState<RevealCard[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("fly");
  const timers = useRef<number[]>([]);
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  });

  const card = queue[index];

  function clearTimers() {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }

  function later(ms: number, run: () => void) {
    timers.current.push(window.setTimeout(run, ms));
  }

  function play() {
    clearTimers();
    if (reducedMotion()) {
      // 動かさずに、表を向いたカードを出す
      setPhase("card");
      playSoftChord();
      return;
    }
    setPhase("fly");
    later(FLY_MS, () => setPhase("open"));
    later(FLY_MS + OPEN_MS, () => {
      setPhase("card");
      playSoftChord();
    });
  }

  useEffect(() => {
    function onOpen() {
      if (cardsRef.current.length === 0) return;
      setQueue(cardsRef.current);
      setIndex(0);
      play();
    }
    window.addEventListener(THANKS_REVEAL_EVENT, onOpen);
    return () => {
      window.removeEventListener(THANKS_REVEAL_EVENT, onOpen);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(last: RevealCard) {
    setQueue([]);
    setIndex(0);
    void fetch("/api/thanks/opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ until: last.createdAt }),
    })
      .catch(() => {})
      .finally(() => router.refresh());
  }

  function stash() {
    if (!card || phase === "stash") return;
    clearTimers();
    const next = index + 1;
    const done = () => {
      if (next < queue.length) {
        setIndex(next);
        play();
      } else {
        finish(card);
      }
    };
    if (reducedMotion()) {
      done();
      return;
    }
    setPhase("stash");
    later(STASH_MS, done);
  }

  useEffect(() => {
    if (!card) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector(".bottom-sheet[data-state='open']")) stash();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!card) return null;
  const { label, icon } = THANKS_KINDS[card.kind];

  return (
    <div className="thanks-reveal" data-phase={phase} data-kind={card.kind} data-noswipe>
      <div className="thanks-reveal-scrim" aria-hidden="true" onClick={() => phase === "card" && stash()} />
      <div className="thanks-reveal-stage" role="dialog" aria-modal="true" aria-label="届いたサンクスカード">
        {queue.length > 1 && (
          <p className="thanks-reveal-count">
            {index + 1} 枚目（全 {queue.length} 枚）
          </p>
        )}
        <div className="thanks-reveal-envelope" aria-hidden="true">
          <span className="thanks-reveal-flap" />
        </div>
        <div className="thanks-reveal-card" key={card.id}>
          <div className="thanks-reveal-face thanks-reveal-back" aria-hidden="true">
            <Icon name="thanks" />
          </div>
          <article className="thanks-reveal-face thanks-reveal-front" aria-label={`${card.fromName}さんからの${label}`}>
            <p className="thanks-reveal-kind">
              <Icon name={icon} />
              {label}
            </p>
            <p className="thanks-reveal-words">{card.message}</p>
            <p className="thanks-reveal-from">
              {card.fromName}さんから<small>（{card.fromLabel}）</small>
            </p>
          </article>
        </div>
        {phase === "card" && (
          <div className="thanks-reveal-actions">
            <ThanksEntry reply person={{ id: card.fromId, name: card.fromName, label: card.fromLabel }} />
            <button type="button" className="secondary" onClick={stash}>
              {index + 1 < queue.length ? "しまって次へ" : "カード帳にしまう"}
            </button>
          </div>
        )}
      </div>
      {(phase === "card" || phase === "open") && (
        <div className="thanks-reveal-petals" aria-hidden="true">
          {Array.from({ length: PETALS }, (_, i) => (
            <i key={i} style={{ "--x": `${(i * 37) % 100}%`, "--d": `${(i % 5) * 0.12}s`, "--r": `${(i * 53) % 360}deg` } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  );
}
