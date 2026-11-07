"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { PartnerLineKind } from "@/lib/partner-lines";
import type { TapReaction } from "./partner-tap";
import { calm, hintPending, WHEEL_HINT_KEY } from "./first-hint";
import { useFirstCardClear } from "./use-first-card-clear";
import "./partner-tap.css";

/** 1字を出す間隔（設計書 §2-1-A：35ms/字の等速。30字で約1秒） */
const CHAR_MS = 35;
/** 話す画面を開いてから輪が光り始めるまで（0.5〜1秒） */
const RING_DELAY_MS = 600;
/** 初めての指の手ほどきが出てから終わるまで（ClickWheel の HINT_MS 1.8秒と後片付け）＋少しの間 */
const HINT_END_MS = 1800 + 200 + 300;
/** 落ち着いているのに手ほどきが出ないまま、これだけたったら待たずに光らせる（手ほどきは落ち着いて 2.6 秒後に出る） */
const HINT_GIVE_UP_MS = 4000;
/** 輪の呼吸 2.8s × 3回 */
const RING_MS = 2800 * 3;
/** 触られないまま、この時間がたったら誘いの一言を添える（§2-1-B） */
const NUDGE_MS = 6000;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** 決まった文を等速で1字ずつ出す。文が替わると最初から。減らす設定では一度に出す */
function useTypewriter(text: string, delayMs: number, ready = true) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const chars = Array.from(text);
    // 0-2q(10)：最初の注意カードが出ている間は、まだ1字も出さない
    if (!ready) {
      setShown(0);
      return;
    }
    if (prefersReducedMotion()) {
      setShown(chars.length);
      return;
    }
    setShown(0);
    let timer: ReturnType<typeof setInterval> | null = null;
    const wait = setTimeout(() => {
      timer = setInterval(() => {
        setShown((n) => {
          if (n + 1 >= chars.length && timer) clearInterval(timer);
          return Math.min(chars.length, n + 1);
        });
      }, CHAR_MS);
    }, delayMs);
    return () => {
      clearTimeout(wait);
      if (timer) clearInterval(timer);
    };
  }, [text, delayMs, ready]);
  return shown;
}

/**
 * 話す前の、パートナーの吹き出し（0-1g(1)、0-2a）。
 * - 吹き出しはパートナーの上に、しっぽがパートナーを指す形で出る（retro.css の .bubble.assistant.latest と .speech-tail の形）
 * - 文字は1字ずつ。出ている間はパートナーが小さく弾む（data-react="talking"）
 * - パートナー（children）か吹き出しをタップすると onTap。次の一言は本体が partner-lines で選び、text で渡す
 * - 吹き出しの大きさは最初から文全体の大きさ（まだ出ていない字は透明）なので、出ている間に形が揺れない
 */
export function PartnerGreeting({
  text,
  kind,
  onTap,
  onTyped,
  reaction = null,
  onAnimationEnd,
  delayMs = 0,
  label = "パートナー。触ると次の一言",
  children,
}: {
  /** 今の一言 */
  text: string;
  /** 一言の種類（見た目の出し分けに使える。data-kind） */
  kind?: PartnerLineKind;
  /** パートナーか吹き出しをタップしたとき */
  onTap?: () => void;
  /** 文字が出終わったとき（誘いの輪を始める合図） */
  onTyped?: () => void;
  /** タップの反応（usePartnerTap の reaction） */
  reaction?: TapReaction | null;
  /** usePartnerTap の onAnimationEnd */
  onAnimationEnd?: (event: { target: EventTarget; currentTarget: EventTarget }) => void;
  /** 最初の1字までの待ち（画面が開いて 300ms 後、など） */
  delayMs?: number;
  /** タップできるパートナーの読み上げ名 */
  label?: string;
  /** パートナーの絵（<VoiceLump /> など） */
  children: ReactNode;
}) {
  const chars = Array.from(text);
  // 0-2q(10)：最初の注意カードが消えてから、delayMs 後に1字目（設計書 §2-5：カード消える → 300ms → 吹き出し）
  const ready = useFirstCardClear();
  const shown = useTypewriter(text, delayMs, ready);
  const typing = shown < chars.length;
  const typedRef = useRef(onTyped);
  useEffect(() => {
    typedRef.current = onTyped;
  }, [onTyped]);

  useEffect(() => {
    if (!typing && chars.length > 0) typedRef.current?.();
  }, [typing, chars.length]);

  const react = reaction ?? (typing && shown > 0 ? "talking" : undefined);

  return (
    <div className="partner-greeting" data-kind={kind} data-waiting={ready ? undefined : "true"}>
      <span className="visually-hidden" aria-live="polite">
        {text}
      </span>
      <p key={text} className="bubble assistant latest partner-bubble" aria-hidden="true" onClick={onTap}>
        {chars.slice(0, shown).join("")}
        <span className="partner-bubble-rest">{chars.slice(shown).join("")}</span>
      </p>
      <span className="speech-tail partner-tail" aria-hidden="true" />
      <button type="button" className="partner-tap" aria-label={label} data-react={react} onClick={onTap} onAnimationEnd={onAnimationEnd}>
        {children}
      </button>
    </div>
  );
}

/**
 * さりげない誘い（0-1g(2)）。話す画面を開いて 0.6 秒後に輪が3回だけ呼吸し（breathing。初めての指の手ほどきがあるときはそのあと）、
 * 6秒触られなければ一度だけ誘いの一言を添える（nudge）。一度話したら（spoken）どちらも出さない。
 * 本体は breathing のあいだ、マイクのまわりに data-invite="breathe" を付ける。
 */
export function usePartnerInvite({ typed: typedNow, spoken }: { typed: boolean; spoken: boolean }) {
  // 最初の問いかけが一度出終わったら、タップで一言が替わっても誘いは数え直さない（輪は2回だけ）
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    if (typedNow) setTyped(true);
  }, [typedNow]);
  const [breathing, setBreathing] = useState(false);
  const [nudge, setNudge] = useState(false);
  const nudged = useRef(false);
  // 輪の光は、開いて少ししたら（最初の一言を待たずに）。初めての指の手ほどきが出るときは、それが終わってから
  const [ringDue, setRingDue] = useState(false);
  const ringDone = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timer = 0;
    const later = (ms: number) => {
      timer = window.setTimeout(() => setRingDue(true), ms);
    };
    // 手ほどき（ClickWheel）は、外側の話す画面で、まだ見せていないときだけ出る
    if (window.self !== window.top || !hintPending(WHEEL_HINT_KEY)) {
      later(RING_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    let calmSince = 0;
    const check = () => {
      if (document.documentElement.dataset.wheelHint === "shown") return later(HINT_END_MS);
      // 見せずに終わった（触られた、別の画面で見せた）ときや、落ち着いてもしばらく出ないときは、待たずに光らせる
      if (!calm()) calmSince = 0;
      else if (!calmSince) calmSince = performance.now();
      if (!hintPending(WHEEL_HINT_KEY) || (calmSince && performance.now() - calmSince > HINT_GIVE_UP_MS)) return later(0);
      timer = window.setTimeout(check, 150);
    };
    timer = window.setTimeout(check, 150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ringDue || spoken || ringDone.current) {
      setBreathing(false);
      return;
    }
    setBreathing(true);
    const stop = setTimeout(() => {
      ringDone.current = true;
      setBreathing(false);
    }, RING_MS);
    return () => clearTimeout(stop);
  }, [ringDue, spoken]);

  useEffect(() => {
    if (spoken) {
      setNudge(false);
      return;
    }
    if (!typed || nudged.current) return;
    let timer = setTimeout(fire, NUDGE_MS);
    function fire() {
      nudged.current = true;
      setNudge(true);
    }
    // 触ったら数え直す（何かしているあいだは誘わない）
    const touched = () => {
      clearTimeout(timer);
      if (!nudged.current) timer = setTimeout(fire, NUDGE_MS);
    };
    document.addEventListener("pointerdown", touched, { passive: true });
    document.addEventListener("keydown", touched);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", touched);
      document.removeEventListener("keydown", touched);
    };
  }, [typed, spoken]);

  return { breathing: breathing && !spoken, nudge: nudge && !spoken };
}
