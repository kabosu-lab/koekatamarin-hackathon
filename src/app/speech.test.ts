import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { joinResults, runListening, SLOW_NOTICE, type SpeechHandlers } from "./speech";

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

  it("しばらく文字が返らなければ、電波のことを一度だけ知らせ、聞き取りは続ける", () => {
    const { calls, value } = handlers();
    runListening(Class, value, { slowMs: 5000 });
    vi.advanceTimersByTime(5100);
    expect(calls.errors).toEqual([SLOW_NOTICE]);
    expect(calls.ended).toBe(0);
    latest().hear(result("遅れて届いた"));
    vi.advanceTimersByTime(20_000);
    expect(calls.errors).toEqual([SLOW_NOTICE]);
  });

  it("文字が返っていれば、電波の知らせは出さない", () => {
    const { calls, value } = handlers();
    runListening(Class, value, { slowMs: 5000 });
    latest().hear(result("こんにちは", false));
    vi.advanceTimersByTime(6000);
    expect(calls.errors).toEqual([]);
  });

  it("止めたのに終わりの知らせが来なくても、届いた言葉は残して終える", () => {
    const { calls, value } = handlers();
    const session = runListening(Class, value);
    latest().hear(result("途中まで", false));
    latest().stop = () => {}; // 終わりの知らせが来ない端末
    session.stop();
    vi.advanceTimersByTime(3000);
    expect(calls.ended).toBe(1);
    expect(calls.final).toEqual(["途中まで"]);
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

describe("声が1区切り固まったときの知らせ（onCommitted）", () => {
  function committedHandlers() {
    const { calls, value } = handlers();
    const committed: number[] = [];
    return { calls, committed, value: { ...value, onCommitted: (length: number) => committed.push(length) } };
  }

  it("確定した区切りが増えるたびに、そこまでの文字の数を知らせる", () => {
    const { committed, value } = committedHandlers();
    runListening(Class, value);
    latest().hear(result("今日の授業で", false));
    expect(committed).toEqual([]);
    latest().hear(result("今日の授業で"));
    expect(committed).toEqual([6]);
    vi.advanceTimersByTime(500);
    latest().hear(result("今日の授業で"), result("声を小さくした"));
    expect(committed).toEqual([6, 13]);
  });

  it("前の知らせから 0.3 秒未満と、2字以下の短い区切りは知らせない", () => {
    const { committed, value } = committedHandlers();
    runListening(Class, value);
    latest().hear(result("今日の授業で"));
    vi.advanceTimersByTime(100);
    latest().hear(result("今日の授業で"), result("静かに"));
    expect(committed).toEqual([6]);
    vi.advanceTimersByTime(400);
    latest().hear(result("今日の授業で"), result("静かに"), result("ね"));
    // 0.3 秒たったので、知らせ損ねた分とまとめて1回
    expect(committed).toEqual([6, 10]);
    vi.advanceTimersByTime(400);
    latest().hear(result("今日の授業で"), result("静かに"), result("ね"), result("あ"));
    expect(committed).toEqual([6, 10]);
  });

  it("確定が来ない端末でも、文字が 0.3 秒変わらず4字以上増えたら1区切りとみなす", () => {
    const { committed, value } = committedHandlers();
    runListening(Class, value);
    latest().hear(result("今日は", false));
    vi.advanceTimersByTime(400);
    expect(committed).toEqual([]);
    latest().hear(result("今日は暑かった", false));
    vi.advanceTimersByTime(200);
    latest().hear(result("今日は暑かったね", false));
    vi.advanceTimersByTime(299);
    expect(committed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(committed).toEqual([8]);
    // あとから同じ文が確定しても、重ねて鳴らさない
    vi.advanceTimersByTime(500);
    latest().hear(result("今日は暑かったね"));
    expect(committed).toEqual([8]);
  });

  it("聞き直しをまたいでも、それまでの言葉の分を数え、止めたあとは知らせない", () => {
    const { committed, value } = committedHandlers();
    const session = runListening(Class, value);
    latest().hear(result("前半の話"));
    vi.advanceTimersByTime(2000);
    latest().onend?.();
    vi.advanceTimersByTime(300);
    latest().hear(result("後半の話"));
    expect(committed).toEqual([4, 8]);
    latest().hear(result("後半の話"), result("まだ続き", false));
    session.stop();
    vi.advanceTimersByTime(1000);
    expect(committed).toEqual([4, 8]);
  });

  it("onCommitted がなくても、これまでどおり動く", () => {
    const { calls, value } = handlers();
    const session = runListening(Class, value);
    latest().hear(result("今日は"));
    vi.advanceTimersByTime(500);
    session.stop();
    expect(calls.final).toEqual(["今日は"]);
  });
});
