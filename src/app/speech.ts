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

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクが使えません。ブラウザの設定で許可するか、文字で書いてください。";
    case "no-speech":
      return "声が聞こえませんでした。もう一度話しかけてみてください。";
    case "aborted":
      return "";
    default:
      return "うまく聞き取れませんでした。もう一度話すか、文字で書いてください。";
  }
}

/** 日本語の聞き取りを始める。戻り値を呼ぶと、そこまでで止める。 */
export function startListening(handlers: SpeechHandlers): () => void {
  const Class = recognitionClass();
  if (!Class) throw new Error("音声認識が使えません");

  const recognition = new Class();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;

  let finalText = "";
  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    handlers.onInterim(finalText + interim);
  };
  recognition.onerror = ({ error }) => {
    const message = errorMessage(error);
    if (message) handlers.onError(message);
  };
  recognition.onend = () => {
    handlers.onEnd();
    if (finalText.trim()) handlers.onFinal(finalText.trim());
  };
  recognition.start();

  return () => recognition.stop();
}
