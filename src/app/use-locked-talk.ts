"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { AIZUCHI_INTERVAL_MS, PAUSE_MS, aizuchiAt, detectCommand, withoutEndWord } from "@/lib/walk-command";
import type { ChatMessage } from "@/lib/claude/types";
import type { SafetyNotice } from "./SafetyCard";
import type { ListeningSession } from "./speech";

const COMMAND_WAIT_MS = 1200;
/** 話した分がこれだけ増えたら、命や安全の確認を通す */
const CHECK_EVERY_CHARS = 400;
const SPEAK_TIMEOUT_MS = 20_000;
const MAX_ASK_TEXT = 2000;

/** 音を鳴らすかは sound.ts と同じく、"on" のときだけ（0-1m の食い違いを直す） */
function soundIsOn(): boolean {
  return document.documentElement.dataset.sound === "on";
}

/**
 * 固定中のふるまい。歩きながら話すと同じく、合いの手、「どう思う？」への声の返事、「終わり」で止まること、
 * 途中の命や安全の確認、画面を点けたままにすることを受け持つ。話した言葉はサーバーに残さない。
 */
export function useLockedTalk({
  session,
  history,
  onSafety,
  onExchange,
}: {
  session: RefObject<ListeningSession | null>;
  history: () => ChatMessage[];
  onSafety(notice: SafetyNotice): void;
  onExchange(asked: string, reply: string): void;
}) {
  const [locked, setLocked] = useState(false);
  const [screenNote, setScreenNote] = useState("");
  const lockedRef = useRef(false);
  const textRef = useRef("");
  const usedRef = useRef(0);
  const checkedRef = useRef(0);
  const speakingRef = useRef(false);
  const lastAizuchi = useRef(0);
  const aizuchiCount = useRef(0);
  const commandTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wake = useRef<{ release(): Promise<void> } | null>(null);

  const keepScreenOn = useCallback(async () => {
    const lock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!lock) {
      setScreenNote("画面が消えると止まります");
      return;
    }
    try {
      wake.current = await lock.request("screen");
      setScreenNote("");
    } catch {
      setScreenNote("画面が消えると止まります");
    }
  }, []);

  /** 声で返す。読み上げの間はマイクを止めて、自分の声を拾わない。 */
  const speak = useCallback(
    async (words: string) => {
      if (!soundIsOn() || typeof speechSynthesis === "undefined" || speakingRef.current) return;
      speakingRef.current = true;
      session.current?.pause();
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(words);
        utterance.lang = "ja-JP";
        const timer = setTimeout(resolve, SPEAK_TIMEOUT_MS);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        speechSynthesis.speak(utterance);
      });
      speakingRef.current = false;
      session.current?.resume();
    },
    [session],
  );

  const ask = useCallback(async () => {
    const asked = textRef.current.slice(usedRef.current).trim().slice(-MAX_ASK_TEXT);
    usedRef.current = textRef.current.length;
    if (!asked) return;
    try {
      const response = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: history(), text: asked }),
      });
      const body = (await response.json().catch(() => ({}))) as { reply?: string; safety?: SafetyNotice };
      if (body.safety) onSafety(body.safety);
      if (!response.ok || !body.reply) {
        await speak("ごめん、今うまく返せへんかった。続けて話してね。");
        return;
      }
      onExchange(asked, body.reply);
      await speak(body.reply);
    } catch {
      await speak("ごめん、つながらへんかった。続けて話してね。");
    }
  }, [history, onExchange, onSafety, speak]);

  const clearTimers = () => {
    clearTimeout(commandTimer.current);
    clearTimeout(pauseTimer.current);
  };

  /** 押している間の聞き取りを、そのまま固定に切り替える。 */
  const lock = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    lastAizuchi.current = Date.now();
    void keepScreenOn();
  }, [keepScreenOn]);

  /** 話した分を受け取る。固定中だけ、頼みごとと合いの手、安全の確認を見る。 */
  const heard = useCallback(
    (text: string) => {
      textRef.current = text;
      if (!lockedRef.current) return;
      if (text.length - checkedRef.current >= CHECK_EVERY_CHARS) {
        checkedRef.current = text.length;
        void fetch("/api/walk/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
          .then((response) => response.json())
          .then((body: { safety?: SafetyNotice }) => body.safety && onSafety(body.safety))
          .catch(() => undefined);
      }
      clearTimers();
      commandTimer.current = setTimeout(() => {
        const command = detectCommand(textRef.current.slice(usedRef.current));
        if (command === "end") session.current?.stop();
        else if (command === "ask") void ask();
      }, COMMAND_WAIT_MS);
      pauseTimer.current = setTimeout(() => {
        if (speakingRef.current || detectCommand(textRef.current.slice(usedRef.current))) return;
        if (Date.now() - lastAizuchi.current < AIZUCHI_INTERVAL_MS) return;
        lastAizuchi.current = Date.now();
        aizuchiCount.current += 1;
        void speak(aizuchiAt(aizuchiCount.current));
      }, PAUSE_MS);
    },
    [ask, onSafety, session, speak],
  );

  /** 聞き取りが終わったときに呼ぶ。パートナーへ送る言葉を返す（すでに聞いた分と「終わり」を除く）。 */
  const finish = useCallback((text: string): string => {
    const wasLocked = lockedRef.current;
    const rest = wasLocked ? withoutEndWord(text.slice(usedRef.current)) : text;
    clearTimers();
    lockedRef.current = false;
    textRef.current = "";
    usedRef.current = 0;
    checkedRef.current = 0;
    setLocked(false);
    setScreenNote("");
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
    return rest;
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      void wake.current?.release().catch(() => undefined);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    [],
  );

  return { locked, lockedRef, screenNote, lock, heard, finish };
}
