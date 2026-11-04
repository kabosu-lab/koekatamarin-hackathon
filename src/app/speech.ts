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

/** これより短く切れたら「すぐ切れた」と数え、続いたらあきらめる（無限に起動し直さない）。 */
const QUICK_END_MS = 1000;
const MAX_QUICK_ENDS = 5;
const RESTART_DELAY_MS = 200;
const DEFAULT_SILENCE_LIMIT_MS = 3 * 60 * 1000;

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
  now?(): number;
};

/**
 * 本人が止めるまで聞き続ける。ブラウザが息つぎや無音で認識を終えても、言葉を残して聞き直す。
 * 実機の挙動（端末ごとの切れ方）は、テストの偽物では確かめられない。`docs/voice-check.md`。
 */
export function runListening(
  Class: RecognitionConstructor,
  handlers: SpeechHandlers,
  { silenceLimitMs = DEFAULT_SILENCE_LIMIT_MS, now = Date.now }: SessionOptions = {},
): ListeningSession {
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
      currentFinal = finalText;
      currentInterim = interim;
      watchSilence();
      handlers.onInterim(committed + currentFinal + currentInterim);
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
      if (current) current.stop();
      else finish();
    },
    pause() {
      if (finished || paused) return;
      paused = true;
      clearTimeout(restartTimer);
      clearTimeout(silenceTimer);
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
