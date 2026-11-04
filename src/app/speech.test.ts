import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinResults, runListening, type SpeechHandlers } from "./speech";

type Result = { 0: { transcript: string }; length: number; isFinal: boolean };

const result = (transcript: string, isFinal = true): Result => ({ 0: { transcript }, length: 1, isFinal });

class Fake {
  static instances: Fake[] = [];
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((event: { resultIndex: number; results: Result[] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  stopCalls = 0;
  constructor() {
    Fake.instances.push(this);
  }
  start() {}
  stop() {
    this.stopCalls += 1;
    this.onend?.();
  }
  hear(...results: Result[]) {
    this.onresult?.({ resultIndex: 0, results });
  }
}

const latest = () => Fake.instances[Fake.instances.length - 1];

function handlers() {
  const calls = { interim: [] as string[], final: [] as string[], errors: [] as string[], ended: 0 };
  const value: SpeechHandlers = {
    onInterim: (text) => calls.interim.push(text),
    onFinal: (text) => calls.final.push(text),
    onError: (message) => calls.errors.push(message),
    onEnd: () => {
      calls.ended += 1;
    },
  };
  return { calls, value };
}

const Class = Fake as unknown as Parameters<typeof runListening>[0];

beforeEach(() => {
  Fake.instances = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("joinResults", () => {
  it("確定と途中を分ける", () => {
    expect(joinResults([result("今日は"), result("暑い", false)])).toEqual({ finalText: "今日は", interim: "暑い" });
  });

  it("前の結果を含んで増えていく端末でも、重ねて足さない", () => {
    expect(joinResults([result("今日は"), result("今日は暑い"), result("今日は暑い")]).finalText).toBe("今日は暑い");
  });
});

describe("runListening", () => {
  it("続けて聞く設定で始める", () => {
    runListening(Class, handlers().value);
    expect(latest().continuous).toBe(true);
    expect(latest().lang).toBe("ja-JP");
  });

  it("息つぎでブラウザが終えても止まらず、言葉を残して聞き直す", () => {
    const { calls, value } = handlers();
    const session = runListening(Class, value);
    latest().hear(result("今日は"));
    vi.advanceTimersByTime(2000);
    latest().onend?.();
    vi.advanceTimersByTime(300);
    expect(calls.ended).toBe(0);
    expect(calls.final).toEqual([]);
    expect(Fake.instances).toHaveLength(2);

    latest().hear(result("暑かった"));
    expect(calls.interim.at(-1)).toBe("今日は暑かった");
    session.stop();
    expect(calls.final).toEqual(["今日は暑かった"]);
    expect(calls.ended).toBe(1);
  });

  it("確定する前に切れても、途中まで聞いた言葉を失わない", () => {
    const { calls, value } = handlers();
    const session = runListening(Class, value);
    latest().hear(result("途中の言葉", false));
    vi.advanceTimersByTime(2000);
    latest().onend?.();
    vi.advanceTimersByTime(300);
    session.stop();
    expect(calls.final).toEqual(["途中の言葉"]);
  });

  it("無音のエラーでは案内を出さず、聞き直す", () => {
    const { calls, value } = handlers();
    runListening(Class, value);
    latest().onerror?.({ error: "no-speech" });
    vi.advanceTimersByTime(2000);
    latest().onend?.();
    vi.advanceTimersByTime(300);
    expect(calls.errors).toEqual([]);
    expect(calls.ended).toBe(0);
    expect(Fake.instances).toHaveLength(2);
  });

  it("マイクを拒否されたら、聞き直さず案内して止まる", () => {
    const { calls, value } = handlers();
    runListening(Class, value);
    latest().onerror?.({ error: "not-allowed" });
    latest().onend?.();
    vi.advanceTimersByTime(1000);
    expect(calls.errors[0]).toContain("マイクが使えません");
    expect(calls.ended).toBe(1);
    expect(Fake.instances).toHaveLength(1);
  });

  it("すぐ切れ続けたら、起動し直し続けず、聞いた言葉を渡して止まる", () => {
    const { calls, value } = handlers();
    runListening(Class, value);
    latest().hear(result("ここまで"));
    for (let i = 0; i < 20; i += 1) {
      latest().onend?.();
      vi.advanceTimersByTime(300);
    }
    expect(Fake.instances.length).toBeLessThanOrEqual(6);
    expect(calls.ended).toBe(1);
    expect(calls.errors).toHaveLength(1);
    expect(calls.final).toEqual(["ここまで"]);
  });

  it("長く話し続ければ、切れた回数が多くても止まらない", () => {
    const { calls, value } = handlers();
    runListening(Class, value);
    for (let i = 0; i < 20; i += 1) {
      latest().hear(result(`${i}`));
      vi.advanceTimersByTime(5000);
      latest().onend?.();
      vi.advanceTimersByTime(10);
    }
    expect(calls.ended).toBe(0);
  });

  it("止めたあとは聞き直さない", () => {
    const { value } = handlers();
    const session = runListening(Class, value);
    session.stop();
    vi.advanceTimersByTime(1000);
    expect(Fake.instances).toHaveLength(1);
  });

  it("声が聞こえないまま長く経つと、マイクを閉じる", () => {
    const { calls, value } = handlers();
    runListening(Class, value, { silenceLimitMs: 60_000 });
    vi.advanceTimersByTime(61_000);
    expect(calls.ended).toBe(1);
  });

  it("読み上げの間は止め、言葉を失わずに再開する", () => {
    const { calls, value } = handlers();
    const session = runListening(Class, value);
    latest().hear(result("前半"));
    vi.advanceTimersByTime(2000);
    session.pause();
    expect(Fake.instances[0].stopCalls).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(Fake.instances).toHaveLength(1);
    expect(calls.ended).toBe(0);

    session.resume();
    vi.advanceTimersByTime(300);
    expect(Fake.instances).toHaveLength(2);
    latest().hear(result("後半"));
    session.stop();
    expect(calls.final).toEqual(["前半後半"]);
  });
});
