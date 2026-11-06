import { describe, expect, it } from "vitest";
import { sendTiming } from "./lumps";
import { commitPopNotes, COMMIT_NOTES, hz, pentatonicUp, raiseLevel, readyChordNotes, scheduleCommitPop, scheduleReadyChord, scheduleSendSound } from "./send-sound";

/** 実物の AudioContext が例外にする使い方を、同じように例外にする偽物。 */
function fakeAudio() {
  const started: { kind: string; at: number; frequency?: number }[] = [];
  const param = () => {
    let curveUntil = -1;
    const p = {
      value: 0,
      first: undefined as number | undefined,
      setValueAtTime(value: number, at: number) {
        if (at < curveUntil) throw new Error("曲線と重なっています");
        p.first ??= value;
      },
      linearRampToValueAtTime() {},
      setTargetAtTime(target: number, _at: number, tau: number) {
        if (tau <= 0) throw new Error("時定数が正しくありません");
      },
      setValueCurveAtTime(points: Float32Array, at: number, duration: number) {
        if (points.length < 2 || duration <= 0) throw new Error("曲線が正しくありません");
        if (points.some((point) => !Number.isFinite(point))) throw new Error("数値が正しくありません");
        p.first ??= points[0];
        curveUntil = at + duration;
      },
    };
    return p;
  };
  const node = () => ({ connect: (next: unknown) => next });
  const audio = {
    sampleRate: 48000,
    createOscillator() {
      const frequency = param();
      const tone = {
        ...node(),
        type: "sine",
        frequency,
        start: (at: number) => started.push({ kind: tone.type, at, frequency: frequency.first ?? frequency.value }),
        stop() {},
      };
      return tone;
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: "", Q: param(), frequency: param() }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource() {
      return { ...node(), buffer: null, start: (at: number) => started.push({ kind: "noise", at }), stop() {} };
    },
  };
  return { audio: audio as unknown as BaseAudioContext, started };
}

describe("送るときの音", () => {
  it.each([0, 1, 2, 3, 5])("言葉が %i 個でも、例外なく組み立てられる", (count) => {
    const { audio, started } = fakeAudio();
    expect(() => scheduleSendSound(audio, {} as AudioNode, 1, count)).not.toThrow();
    expect(started.some((item) => item.kind === "noise")).toBe(true);
  });

  it("言葉ごとに音階が上がり、動きと同じ時刻で鳴る", () => {
    const { audio, started } = fakeAudio();
    scheduleSendSound(audio, {} as AudioNode, 0, 5);
    const timing = sendTiming(5);
    const carriers = started.filter((item) => item.kind === "sine" && item.frequency && timing.wordTimes.includes(item.at));
    const notes = [72, 74, 76, 79, 81].map((note) => Number((hz(note) * 1.12).toFixed(2)));
    expect(notes.every((note) => carriers.some((item) => Number(item.frequency?.toFixed(2)) === note))).toBe(true);
    expect(started.some((item) => item.kind === "noise" && item.at === timing.launch)).toBe(true);
  });

  it("ヒューンは、飛ぶ少し前から音程のある音で鳴る", () => {
    const { audio, started } = fakeAudio();
    scheduleSendSound(audio, {} as AudioNode, 0, 3);
    const { launch } = sendTiming(3);
    expect(started.some((item) => item.kind === "triangle" && Math.abs(item.at - (launch - 0.03)) < 0.001)).toBe(true);
  });
});

// 0-1g(4)(5)：ポン・締めの和音・とどけるの段
/** ハ長調ペンタトニック（ド・レ・ミ・ソ・ラ）の音か */
const inPentatonic = (note: number) => [0, 2, 4, 7, 9].includes(((note % 12) + 12) % 12);

describe("ポンの音階", () => {
  it("区切りごとに1段ずつ上がり、上端で留まる", () => {
    const mains = Array.from({ length: 12 }, (_, i) => commitPopNotes(i + 1)[0].note);
    expect(mains.slice(0, 10)).toEqual(COMMIT_NOTES);
    expect(mains[10]).toBe(93);
    expect(mains[11]).toBe(93);
    for (let i = 1; i < 10; i++) expect(mains[i]).toBeGreaterThan(mains[i - 1]);
  });

  it("5段目までは単音、6段目からは小さな音を上に重ねて豊かにする", () => {
    expect(commitPopNotes(5)).toHaveLength(1);
    const rich = commitPopNotes(6);
    expect(rich).toHaveLength(2);
    expect(rich[1].note).toBe(91);
    expect(rich[1].volume).toBeLessThan(rich[0].volume);
  });

  it("すべての音がペンタトニックに収まり、小さく鳴る", () => {
    for (let step = 1; step <= 12; step++) {
      for (const { note, volume } of commitPopNotes(step)) {
        expect(inPentatonic(note)).toBe(true);
        expect(volume).toBeLessThanOrEqual(0.22);
      }
    }
  });

  it("0 や負の段でも最初の音にする", () => {
    expect(commitPopNotes(0)[0].note).toBe(72);
    expect(commitPopNotes(-3)[0].note).toBe(72);
  });

  it("ペンタトニックで上へたどる", () => {
    expect(pentatonicUp(72, 1)).toBe(74);
    expect(pentatonicUp(81, 1)).toBe(84);
    expect(pentatonicUp(88, 3)).toBe(96);
    expect(() => pentatonicUp(71, 1)).toThrow();
  });
});

describe("とどけるの締めの和音", () => {
  it("段が上がるほど音が増え、段3は主音（ド）にもう一度落ち着く", () => {
    expect(readyChordNotes(0)).toEqual([]);
    expect(readyChordNotes(1).map(({ note }) => note)).toEqual([72, 79]);
    expect(readyChordNotes(2).map(({ note }) => note)).toEqual([72, 76, 79]);
    const top = readyChordNotes(3);
    expect(top.map(({ note }) => note)).toEqual([72, 76, 79, 84, 84]);
    expect(top.map(({ delay }) => Math.round(delay * 1000))).toEqual([0, 60, 120, 180, 240]);
  });

  it("すべてペンタトニックの音", () => {
    for (const level of [1, 2, 3] as const) {
      for (const { note } of readyChordNotes(level)) expect(inPentatonic(note)).toBe(true);
    }
  });
});

describe("段は上がるだけ", () => {
  it("低い段が来ても下げず、範囲の外は 0〜3 に収める", () => {
    expect(raiseLevel(0, 1)).toBe(1);
    expect(raiseLevel(2, 1)).toBe(2);
    expect(raiseLevel(2, 0)).toBe(2);
    expect(raiseLevel(1, 3)).toBe(3);
    expect(raiseLevel(0, 9)).toBe(3);
    expect(raiseLevel(1, Number.NaN)).toBe(1);
  });
});

describe("音を組み立てる", () => {
  /** 鳴らし始めた時刻を記録する、Web Audio の偽物 */
  function fakeAudio() {
    const started: number[] = [];
    const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
    const node = () => ({ connect: (next: unknown) => next });
    const audio = {
      createOscillator: () => ({ ...node(), frequency: param(), start: (at: number) => started.push(at), stop() {} }),
      createGain: () => ({ ...node(), gain: param() }),
    } as unknown as BaseAudioContext;
    return { audio, out: node() as unknown as AudioNode, started };
  }

  it("ポンは段の音の数だけ鳴らす（1つの音に2つの発振器）", () => {
    const { audio, out, started } = fakeAudio();
    scheduleCommitPop(audio, out, 1, 1);
    expect(started).toHaveLength(2);
    scheduleCommitPop(audio, out, 2, 7);
    expect(started).toHaveLength(6);
  });

  it("和音は少しずつずらして鳴らす", () => {
    const { audio, out, started } = fakeAudio();
    scheduleReadyChord(audio, out, 1, 2);
    expect([...new Set(started)].map((at) => Math.round((at - 1) * 1000))).toEqual([0, 60, 120]);
  });
});
