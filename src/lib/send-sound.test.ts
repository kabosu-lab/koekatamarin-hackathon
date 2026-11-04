import { describe, expect, it } from "vitest";
import { sendTiming } from "./lumps";
import { hz, scheduleSendSound } from "./send-sound";

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
