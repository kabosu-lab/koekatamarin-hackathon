"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft, Review } from "@/lib/claude/compose";
import type { ChannelView, PersonView } from "@/lib/destination/types";
import { AIZUCHI_INTERVAL_MS, PAUSE_MS, aizuchiAt, detectCommand, withoutEndWord } from "@/lib/walk-command";
import { Compose, type ComposeStart } from "../Compose";
import { TRIAL_SAFETY_SPEECH } from "@/lib/trial";
import { SafetyCard, type SafetyNotice } from "../SafetyCard";
import { useTrial } from "../TrialContext";
import { SendBurst } from "../SendBurst";
import { playSendSound, soundAllowed } from "../sound";
import { isSpeechSupported, startSession, type ListeningSession } from "../speech";

/** 間のあとに頼みごとを読む長さ。言い終わりを待つ */
const COMMAND_WAIT_MS = 1200;
/** 話した分がこれだけ増えたら、命や安全の確認を通す */
const CHECK_EVERY_CHARS = 400;
const SILENCE_LIMIT_MS = 10 * 60 * 1000;
const SPEAK_TIMEOUT_MS = 20_000;
const MAX_ASK_TEXT = 2000;
const HISTORY_LIMIT = 10;

type Phase = "ready" | "listening" | "stopped" | "thinking" | "done";
type Turn = { role: "user" | "assistant"; content: string };
type Finished = {
  summary: string[];
  drafts: { draft: Draft; review: Review }[];
  channels: ChannelView[];
  people: PersonView[];
};

const storageKey = (viewerId: string) => `koekata-walk-${viewerId}`;

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

export function WalkMode({ viewer, viewerId }: { viewer: { name: string; label: string }; viewerId: string }) {
  const trial = useTrial();
  const [phase, setPhase] = useState<Phase>("ready");
  const [spoken, setSpoken] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [notice, setNotice] = useState("");
  const [screenNote, setScreenNote] = useState("");
  const [aizuchiOn, setAizuchiOn] = useState(true);
  const [safety, setSafety] = useState<SafetyNotice | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [composing, setComposing] = useState<ComposeStart | null>(null);
  const [sentWords, setSentWords] = useState<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);

  const session = useRef<ListeningSession | null>(null);
  const wake = useRef<{ release(): Promise<void> } | null>(null);
  const textRef = useRef("");
  const baseRef = useRef("");
  const usedRef = useRef(0);
  const checkedRef = useRef(0);
  const historyRef = useRef<Turn[]>([]);
  const commandTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAizuchi = useRef(0);
  const aizuchiCount = useRef(0);
  const speakingRef = useRef(false);
  const aizuchiOnRef = useRef(true);
  const finishingRef = useRef(false);
  const safetySpokenRef = useRef(false);

  useEffect(() => {
    aizuchiOnRef.current = aizuchiOn;
  }, [aizuchiOn]);

  // 途中で画面を開き直しても、話した言葉を失わない。ブラウザの中だけで、サーバーには残さない
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(viewerId));
      if (saved) {
        textRef.current = saved;
        baseRef.current = saved;
        checkedRef.current = saved.length;
        usedRef.current = saved.length;
        setSpoken(saved);
        setPhase("stopped");
      }
    } catch {
      // 残せなくても話せる
    }
  }, [viewerId]);

  const remember = useCallback(
    (text: string) => {
      try {
        if (text) sessionStorage.setItem(storageKey(viewerId), text);
        else sessionStorage.removeItem(storageKey(viewerId));
      } catch {
        // 残せなくても話せる
      }
    },
    [viewerId],
  );

  const keepScreenOn = useCallback(async () => {
    const lock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!lock) {
      setScreenNote("この端末では画面を点けたままにできません。端末の設定で、画面が消えるまでの時間を長くしてください。");
      return;
    }
    try {
      wake.current = await lock.request("screen");
      setScreenNote("");
    } catch {
      setScreenNote("画面を点けたままにできませんでした。画面が消えると聞き取りも止まります。");
    }
  }, []);

  const letScreenSleep = useCallback(() => {
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
  }, []);

  /** 声で返す。読み上げの間はマイクを止めて、自分の声を拾わない。声を消す設定なら読み上げない。 */
  const speak = useCallback(async (words: string) => {
    if (!soundAllowed() || typeof speechSynthesis === "undefined" || speakingRef.current) return;
    speakingRef.current = true;
    session.current?.pause();
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(words);
      utterance.lang = "ja-JP";
      // 端末によって終わりの知らせが来ないことがある
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
  }, []);

  const showSafety = useCallback(
    (value: unknown) => {
      if (!value) return;
      setSafety(value as SafetyNotice);
      if (!safetySpokenRef.current) {
        safetySpokenRef.current = true;
        void speak(
          trial
            ? TRIAL_SAFETY_SPEECH
            : "大事な話やと思うから、相談室の先生に要点だけ伝えました。今すぐ話したいときは、画面の窓口につながるよ。すぐ危ないときは、110番か119番に電話してね。",
        );
      }
    },
    [speak, trial],
  );

  /** 話している途中でも、命や安全の確認を通す。話の流れは止めない。 */
  const checkSafetyIfNeeded = useCallback(() => {
    const text = textRef.current;
    if (text.length - checkedRef.current < CHECK_EVERY_CHARS) return;
    checkedRef.current = text.length;
    void postJson("/api/walk/check", { text })
      .then(({ body }) => showSafety(body.safety))
      .catch(() => undefined);
  }, [showSafety]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearTimeout(commandTimer.current);
    clearTimeout(pauseTimer.current);
    letScreenSleep();
    const text = withoutEndWord(textRef.current);
    textRef.current = text;
    baseRef.current = text;
    setSpoken(text);
    remember(text);
    if (!text) {
      setPhase("ready");
      finishingRef.current = false;
      return;
    }
    setPhase("thinking");
    setNotice("");
    try {
      const { ok, body } = await postJson("/api/walk/finish", { text });
      showSafety(body.safety);
      if (!ok) {
        setNotice(typeof body.error === "string" ? body.error : "整理できませんでした。もう一度押してください。");
        setPhase("stopped");
        return;
      }
      setFinished(body as unknown as Finished);
      setPhase("done");
      void speak("整理できました。画面で下書きを見てね。");
    } catch {
      setNotice("整理できませんでした。話した言葉は残っています。もう一度押してください。");
      setPhase("stopped");
    } finally {
      finishingRef.current = false;
    }
  }, [letScreenSleep, remember, showSafety, speak]);

  const askClaude = useCallback(async () => {
    const asked = textRef.current.slice(usedRef.current).trim().slice(-MAX_ASK_TEXT);
    usedRef.current = textRef.current.length;
    if (!asked) return;
    try {
      const { ok, body } = await postJson("/api/converse", { history: historyRef.current.slice(-HISTORY_LIMIT), text: asked });
      showSafety(body.safety);
      if (!ok || typeof body.reply !== "string") {
        await speak("ごめん、今うまく返せへんかった。続けて話してね。");
        return;
      }
      historyRef.current = [...historyRef.current, { role: "user" as const, content: asked }, { role: "assistant" as const, content: body.reply }];
      setLastReply(body.reply);
      await speak(body.reply);
    } catch {
      await speak("ごめん、つながらへんかった。続けて話してね。");
    }
  }, [showSafety, speak]);

  const heard = useCallback(
    (text: string) => {
      const full = baseRef.current + text;
      textRef.current = full;
      setSpoken(full);
      remember(full);
      checkSafetyIfNeeded();

      clearTimeout(commandTimer.current);
      commandTimer.current = setTimeout(() => {
        const command = detectCommand(textRef.current.slice(usedRef.current));
        if (command === "end") session.current?.stop();
        else if (command === "ask") void askClaude();
      }, COMMAND_WAIT_MS);

      clearTimeout(pauseTimer.current);
      pauseTimer.current = setTimeout(() => {
        if (!aizuchiOnRef.current || speakingRef.current) return;
        if (detectCommand(textRef.current.slice(usedRef.current))) return;
        if (Date.now() - lastAizuchi.current < AIZUCHI_INTERVAL_MS) return;
        lastAizuchi.current = Date.now();
        aizuchiCount.current += 1;
        void speak(aizuchiAt(aizuchiCount.current));
      }, PAUSE_MS);
    },
    [askClaude, checkSafetyIfNeeded, remember, speak],
  );

  const start = useCallback(() => {
    setNotice("");
    if (!isSpeechSupported()) {
      setNotice("このブラウザでは声が使えません。");
      return;
    }
    baseRef.current = textRef.current;
    lastAizuchi.current = Date.now();
    setPhase("listening");
    void keepScreenOn();
    session.current = startSession(
      {
        onInterim: heard,
        onFinal: () => undefined,
        onError: setNotice,
        onEnd: () => {
          session.current = null;
          clearTimeout(commandTimer.current);
          clearTimeout(pauseTimer.current);
          letScreenSleep();
          const command = detectCommand(textRef.current.slice(usedRef.current));
          if (command === "end" || finishingRequested.current) {
            finishingRequested.current = false;
            void finish();
          } else {
            setPhase("stopped");
          }
        },
      },
      { silenceLimitMs: SILENCE_LIMIT_MS },
    );
  }, [finish, heard, keepScreenOn, letScreenSleep]);

  const finishingRequested = useRef(false);

  function stopAndFinish() {
    finishingRequested.current = true;
    if (session.current) session.current.stop();
    else {
      finishingRequested.current = false;
      void finish();
    }
  }

  // 画面に戻ったら、画面を点けておく指定をやり直す（隠れると解除される）
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && session.current) void keepScreenOn();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [keepScreenOn]);

  useEffect(
    () => () => {
      clearTimeout(commandTimer.current);
      clearTimeout(pauseTimer.current);
      session.current?.stop();
      void wake.current?.release().catch(() => undefined);
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    [],
  );

  function resetAll() {
    textRef.current = "";
    baseRef.current = "";
    usedRef.current = 0;
    checkedRef.current = 0;
    historyRef.current = [];
    remember("");
    setSpoken("");
    setFinished(null);
    setLastReply("");
    setSentWords(null);
    setPhase("ready");
  }

  if (composing && finished) {
    return (
      <Compose
        {...composing}
        viewer={viewer}
        onCancel={() => setComposing(null)}
        onSent={(_channel, _postId, words) => {
          setComposing(null);
          setBurst(words);
          setSentWords(words);
          playSendSound(words);
        }}
      />
    );
  }

  return (
    <div className="walk">
      {burst && <SendBurst words={burst} onDone={() => setBurst(null)} />}
      {safety && <SafetyCard notice={safety} />}
      {notice && <p className="notice">{notice}</p>}

      {phase === "ready" && (
        <section className="walk-start" aria-label="歩きながら話すを始める">
          <button type="button" className="primary" onClick={start}>
            話し始める
          </button>
          <ul className="walk-help">
            <li>「どう思う？」「調べて」「壁打ちして」と言うと、パートナーが声で答えます</li>
            <li>区切って「終わり」と言うと止まって、整理します</li>
            <li>画面を消すと聞き取りも止まります。画面を点けたまま使ってください</li>
            <li>周りの音や風で、聞き取りが乱れることがあります</li>
          </ul>
        </section>
      )}

      {phase === "listening" && (
        <section className="walk-live" aria-label="聞いています">
          <p className="walk-state" role="status">
            聞いています
          </p>
          {screenNote && <p className="notice">{screenNote}</p>}
          <p className="walk-caution">画面を消すと止まります</p>
          <p className="walk-words">{spoken.slice(-200) || "どうぞ、話してください"}</p>
          {lastReply && <p className="walk-reply">パートナー：{lastReply}</p>}
          <label className="walk-toggle">
            <input type="checkbox" checked={aizuchiOn} onChange={(event) => setAizuchiOn(event.target.checked)} />
            合いの手を入れる
          </label>
          <button type="button" className="primary stop" onClick={stopAndFinish}>
            話し終わった
          </button>
        </section>
      )}

      {phase === "stopped" && (
        <section className="walk-live" aria-label="止まっています">
          <p className="walk-state" role="status">
            止まっています
          </p>
          <p className="walk-words">{spoken.slice(-200)}</p>
          <div className="row">
            <button type="button" onClick={start}>
              続けて話す
            </button>
            <button type="button" className="primary" onClick={() => void finish()}>
              整理する
            </button>
          </div>
          <button type="button" className="link-button" onClick={resetAll}>
            話した言葉を消す
          </button>
        </section>
      )}

      {phase === "thinking" && (
        <p className="walk-state" role="status">
          整理しています…
        </p>
      )}

      {phase === "done" && finished && (
        <>
          {sentWords && (
            <p className="sent" role="status">
              届けました。
            </p>
          )}
          <section className="walk-summary" aria-label="話の整理">
            <h2>話の整理</h2>
            {finished.summary.length > 0 ? (
              <ul>
                {finished.summary.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>整理できることが見つかりませんでした。</p>
            )}
          </section>
          <section className="walk-drafts" aria-label="投稿の下書き">
            <h2>投稿の下書き</h2>
            {finished.drafts.length === 0 && <p>投稿にできるお話は、まだなさそうです。</p>}
            {finished.drafts.map(({ draft, review }, index) => (
              <article key={index} aria-label={`下書き ${index + 1}`}>
                <p className="walk-draft-text">{draft.text}</p>
                <button
                  type="button"
                  onClick={() =>
                    setComposing({ draft, review, channels: finished.channels, people: finished.people })
                  }
                >
                  これを確かめて送る
                </button>
              </article>
            ))}
            <p className="muted">送るのは、確かめたあとのあなたです。AI は送りません。</p>
          </section>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                setFinished(null);
                start();
              }}
            >
              続けて話す
            </button>
            <button type="button" onClick={resetAll}>
              おしまいにする
            </button>
          </div>
        </>
      )}
    </div>
  );
}
