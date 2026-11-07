import { isEchoOf } from "@/lib/echo";

/** ブラウザの音声認識のうち、この画面が使う部分。 */
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type RecognitionConstructor = new () => Recognition;

export type SpeechHandlers = {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(message: string): void;
  onEnd(): void;
  /**
   * 声が1区切り文字に固まったとき（確定した区切りごと）。finalLength はそこまでに固まった文字の数。
   * 短すぎる区切り（2字以下）と、前の呼び出しから 0.3 秒未満のときは呼ばない。ポンの音を鳴らすため。
   */
  onCommitted?(finalLength: number): void;
};

function recognitionClass(): RecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSpeechSupported(): boolean {
  return recognitionClass() !== undefined;
}

/** マイクの許可など、聞き直しても直らないもの。 */
const FATAL_ERRORS: Record<string, string> = {
  "not-allowed": "マイクが使えません。ブラウザの設定で許可するか、文字で書いてください。",
  "service-not-allowed": "マイクが使えません。ブラウザの設定で許可するか、文字で書いてください。",
  "audio-capture": "マイクが見つかりません。つなぎ方を確かめるか、文字で書いてください。",
  "language-not-supported": "このブラウザでは日本語の聞き取りが使えません。文字で書いてください。",
};
const GAVE_UP = "うまく聞き取りを続けられませんでした。もう一度話すか、文字で書いてください。";
/** スマホの聞き取りは声をサーバーへ送って文字にするので、電波が弱いと文字が返ってこないことがある */
export const SLOW_NOTICE = "まだ文字になっていません。電波が弱いかもしれません。そのまま話し続けるか、文字で書いてください。";
const DEFAULT_SLOW_MS = 7000;
/** 止めたあと、ブラウザの終わりの知らせを待つ長さ。来なくても、聞いた言葉は渡す */
const STOP_GRACE_MS = 2500;

/** これより短く切れたら「すぐ切れた」と数え、続いたらあきらめる（無限に起動し直さない）。 */
const QUICK_END_MS = 1000;
const MAX_QUICK_ENDS = 5;
const RESTART_DELAY_MS = 200;
const DEFAULT_SILENCE_LIMIT_MS = 3 * 60 * 1000;
/** 区切りの知らせ（onCommitted）の間をこれだけあける。これより短い区切りは知らせない */
const COMMIT_GAP_MS = 300;
const COMMIT_MIN_CHARS = 3;
/** 確定（isFinal）が来ない端末の保険：文字がこれだけ変わらず、これだけ増えたら1区切りとみなす */
const STEADY_MS = 300;
const STEADY_MIN_CHARS = 4;

/**
 * 1回の認識の結果を文章にする。端末によって、確定した結果が前の結果を含んだまま
 * 増えていくことがあるので、重ねて足さない。`resultIndex` に頼らず毎回全部から作る。
 */
export function joinResults(results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>): {
  finalText: string;
  interim: string;
} {
  let finalText = "";
  let interim = "";
  for (let i = 0; i < results.length; i += 1) {
    const { transcript } = results[i][0];
    if (!results[i].isFinal) interim += transcript;
    else if (transcript.startsWith(finalText)) finalText = transcript;
    else if (!finalText.endsWith(transcript)) finalText += transcript;
  }
  return { finalText, interim };
}

/** 読み上げが終わってから、これだけの間は、読み上げた文と重なる聞き取りを捨てる（0-3l） */
const ECHO_WINDOW_MS = 20_000;
const spokenLog: { text: string; endedAt: number }[] = [];

/** パートナーがこれから読み上げる文を覚えておく。聞き取りがそれを拾っても本人の言葉にしない */
export function noteSpoken(text: string): void {
  spokenLog.push({ text, endedAt: Infinity });
  if (spokenLog.length > 20) spokenLog.splice(0, spokenLog.length - 20);
}

/** 読み上げが終わった時刻を残す。そこから ECHO_WINDOW_MS の間だけ見分ける */
export function noteSpeechEnded(at = Date.now()): void {
  for (const entry of spokenLog) if (entry.endedAt === Infinity) entry.endedAt = at;
}

/** 読み上げ中か、読み上げてまもない文 */
export function recentlySpoken(at = Date.now()): string[] {
  return spokenLog.filter((entry) => at - entry.endedAt < ECHO_WINDOW_MS).map((entry) => entry.text);
}

/** テスト用：覚えた読み上げを消す */
export function forgetSpoken(): void {
  spokenLog.length = 0;
}

export type ListeningSession = {
  /** 本人が止める。そこまでの言葉を渡して終わる */
  stop(): void;
  /** 読み上げの間だけマイクを止める。言葉は失わない */
  pause(): void;
  resume(): void;
};

export type SessionOptions = {
  /** 声が聞こえないまま、これだけ経ったら止める（マイクを開けたままにしない） */
  silenceLimitMs?: number;
  /** 聞き始めてから、これだけ経っても文字が1つも返らなければ、電波のことを知らせる（聞き取りは続ける） */
  slowMs?: number;
  now?(): number;
  /** 聞き取った区切りが、パートナーの読み上げを拾ったものか。既定は直前に読み上げた文との重なりで見る */
  isEcho?(segment: string): boolean;
};

/**
 * 本人が止めるまで聞き続ける。ブラウザが息つぎや無音で認識を終えても、言葉を残して聞き直す。
 * 実機の挙動（端末ごとの切れ方）は、テストの偽物では確かめられない。`docs/voice-check.md`。
 */
export function runListening(
  Class: RecognitionConstructor,
  handlers: SpeechHandlers,
  { silenceLimitMs = DEFAULT_SILENCE_LIMIT_MS, slowMs = DEFAULT_SLOW_MS, now = Date.now, isEcho }: SessionOptions = {},
): ListeningSession {
  const echo = isEcho ?? ((segment: string) => isEchoOf(segment, recentlySpoken(now())));
  let committed = "";
  let currentFinal = "";
  let currentInterim = "";
  let current: Recognition | null = null;
  let startedAt = 0;
  let quickEnds = 0;
  let stopping = false;
  let paused = false;
  let finished = false;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let heardAny = false;
  /** 読み上げのために止めた認識と、止めたときまでに聞いていた文。止めたあとに届いた分は読み上げの拾い込みかもしれない */
  let pausedRecognition: Recognition | null = null;
  let heardAtPause = "";
  let steadyTimer: ReturnType<typeof setTimeout> | undefined;
  /** 最後に区切りを知らせたときの文字の数と時刻 */
  let signaledLength = 0;
  let signaledAt = -Infinity;

  const signalCommitted = (length: number, minChars: number) => {
    if (!handlers.onCommitted || finished || paused) return;
    if (length - signaledLength < minChars) return;
    const time = now();
    if (time - signaledAt < COMMIT_GAP_MS) return;
    signaledLength = length;
    signaledAt = time;
    handlers.onCommitted(length);
  };
  const slowTimer = setTimeout(() => {
    if (!heardAny && !finished) handlers.onError(SLOW_NOTICE);
  }, slowMs);

  const commit = () => {
    committed += currentFinal + currentInterim;
    currentFinal = "";
    currentInterim = "";
  };

  const finish = (message?: string) => {
    if (finished) return;
    finished = true;
    clearTimeout(restartTimer);
    clearTimeout(silenceTimer);
    clearTimeout(stopTimer);
    clearTimeout(slowTimer);
    clearTimeout(steadyTimer);
    commit();
    if (message) handlers.onError(message);
    handlers.onEnd();
    if (committed.trim()) handlers.onFinal(committed.trim());
  };

  const watchSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      stopping = true;
      if (current) current.stop();
      else finish();
    }, silenceLimitMs);
  };

  const begin = () => {
    if (finished || stopping || paused) return;
    const recognition = new Class();
    recognition.lang = "ja-JP";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      if (recognition !== current) return;
      const { finalText, interim } = joinResults(event.results);
      const segment = finalText + interim;
      if (recognition === pausedRecognition) {
        // 止めたあとに増えた分が読み上げと重なるなら、止めたときまでの言葉だけ残す
        const added = segment.startsWith(heardAtPause) ? segment.slice(heardAtPause.length) : segment;
        if (echo(added)) {
          currentFinal = heardAtPause;
          currentInterim = "";
          return;
        }
      } else if (echo(segment)) {
        // 読み上げを拾った区切りは、本人の言葉に入れない
        currentFinal = "";
        currentInterim = "";
        return;
      }
      currentFinal = finalText;
      currentInterim = interim;
      if (finalText || interim) heardAny = true;
      watchSilence();
      const heard = committed + currentFinal + currentInterim;
      handlers.onInterim(heard);
      signalCommitted(committed.length + currentFinal.length, COMMIT_MIN_CHARS);
      if (handlers.onCommitted) {
        clearTimeout(steadyTimer);
        steadyTimer = setTimeout(() => signalCommitted(heard.length, STEADY_MIN_CHARS), STEADY_MS);
      }
    };
    recognition.onerror = ({ error }) => {
      const fatal = FATAL_ERRORS[error];
      if (!fatal) return; // 無音（no-speech）や通信の一時的な失敗は、聞き直す
      stopping = true;
      current = null;
      finish(fatal);
    };
    recognition.onend = () => {
      if (recognition !== current) return;
      current = null;
      commit();
      if (stopping) {
        finish();
        return;
      }
      if (paused) return;
      quickEnds = now() - startedAt < QUICK_END_MS ? quickEnds + 1 : 0;
      if (quickEnds >= MAX_QUICK_ENDS) {
        finish(GAVE_UP);
        return;
      }
      restartTimer = setTimeout(begin, quickEnds > 0 ? RESTART_DELAY_MS : 0);
    };
    current = recognition;
    startedAt = now();
    try {
      recognition.start();
    } catch {
      current = null;
      finish(GAVE_UP);
    }
  };

  watchSilence();
  begin();

  return {
    stop() {
      if (finished) return;
      stopping = true;
      clearTimeout(restartTimer);
      if (current) {
        // 電波が弱いと、終わりの知らせが遅れたり来なかったりする。待っても来なければ、届いた分で終える
        stopTimer = setTimeout(() => {
          if (current) current.onend = null;
          current = null;
          finish();
        }, STOP_GRACE_MS);
        current.stop();
      } else finish();
    },
    pause() {
      if (finished || paused) return;
      paused = true;
      pausedRecognition = current;
      heardAtPause = currentFinal + currentInterim;
      clearTimeout(restartTimer);
      clearTimeout(silenceTimer);
      clearTimeout(steadyTimer);
      current?.stop();
    },
    resume() {
      if (finished || !paused) return;
      paused = false;
      watchSilence();
      // 止めた認識の終わりを待たずに次を始めると、端末によっては失敗する
      if (!current) begin();
      else restartTimer = setTimeout(() => {
        if (!current) begin();
        else {
          current.onend = null;
          current = null;
          commit();
          begin();
        }
      }, RESTART_DELAY_MS);
    },
  };
}

/** 長く話す使い方（歩きながら話すなど）のための入口。 */
export function startSession(handlers: SpeechHandlers, options?: SessionOptions): ListeningSession {
  const Class = recognitionClass();
  if (!Class) throw new Error("音声認識が使えません");
  return runListening(Class, handlers, options);
}

/** 日本語の聞き取りを始める。戻り値を呼ぶと、そこまでで止める。 */
export function startListening(handlers: SpeechHandlers): () => void {
  const session = startSession(handlers);
  return () => session.stop();
}
