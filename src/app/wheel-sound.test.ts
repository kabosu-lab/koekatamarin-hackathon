import { beforeEach, describe, expect, it, vi } from "vitest";

const output = vi.hoisted(() => ({ current: null as null | { audio: ReturnType<typeof fakeAudio>; out: object } }));

vi.mock("./sound", () => ({ audioOutput: () => output.current }));

import { CLICK_BAND_HZ, CLICK_GAIN, playWheelClick, playWheelOpen, TOOTH_HZ, TOOTH_SECONDS } from "./wheel-sound";

/** 作った音の部品を記録する偽物。 */
function fakeAudio(state: string) {
  const made = { sources: 0, oscillators: [] as { frequency: number; stopAt: number }[], bands: [] as number[], peaks: [] as number[] };
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime(value: number) {
      made.peaks.push(value);
    },
    setTargetAtTime() {},
    exponentialRampToValueAtTime() {},
    setValueCurveAtTime() {},
    cancelScheduledValues() {},
  });
  const node = () => ({ connect: (next: unknown) => next });
  return {
    state,
    made,
    sampleRate: 48000,
    currentTime: 1,
    createBuffer: () => ({ getChannelData: () => new Float32Array(960) }),
    createBufferSource() {
      made.sources++;
      return { ...node(), buffer: null, start() {}, stop() {} };
    },
    createBiquadFilter() {
      const filter = { ...node(), type: "", Q: param(), frequency: param() };
      return new Proxy(filter, {
        get(target, key) {
          if (key === "connect") made.bands.push(target.frequency.value);
          return target[key as keyof typeof target];
        },
      });
    },
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator() {
      const tone = {
        ...node(),
        type: "sine",
        frequency: param(),
        start() {},
        stop(at: number) {
          made.oscillators.push({ frequency: tone.frequency.value, stopAt: at });
        },
      };
      return tone;
    },
  };
}

describe("ホイールのカリ（0-2w）", () => {
  beforeEach(() => {
    output.current = null;
  });

  it("音が起きていないときは、カリを積まずに捨てる（離した瞬間に塊で鳴らない）", () => {
    const audio = fakeAudio("suspended");
    output.current = { audio, out: {} };
    playWheelClick(3);
    expect(audio.made.sources).toBe(0);
    expect(audio.made.oscillators).toHaveLength(0);
  });

  it("止まった（interrupted）ときも捨てる", () => {
    const audio = fakeAudio("interrupted");
    output.current = { audio, out: {} };
    playWheelClick(1);
    expect(audio.made.sources).toBe(0);
  });

  it("起きているときは、3kHz の雑音と 800Hz・15ms の歯で鳴らす", () => {
    const audio = fakeAudio("running");
    output.current = { audio, out: {} };
    playWheelClick(1);
    expect(audio.made.sources).toBe(1);
    expect(audio.made.bands).toContain(3000);
    expect(audio.made.peaks).toContain(CLICK_GAIN);
    expect(audio.made.oscillators).toHaveLength(1);
    expect(audio.made.oscillators[0].frequency).toBe(800);
    expect(audio.made.oscillators[0].stopAt - audio.currentTime).toBeCloseTo(0.02 + 0.015, 5);
  });

  it("値は点検で決めた範囲に収まる", () => {
    expect(CLICK_BAND_HZ).toBe(3000);
    expect(CLICK_GAIN).toBeGreaterThanOrEqual(0.25);
    expect(CLICK_GAIN).toBeLessThanOrEqual(0.3);
    expect(TOOTH_HZ).toBe(800);
    expect(TOOTH_SECONDS).toBe(0.015);
  });

  it("1コマに積むのは最大3回", () => {
    const audio = fakeAudio("running");
    output.current = { audio, out: {} };
    playWheelClick(10);
    expect(audio.made.sources).toBe(3);
  });

  it("音が出せない（audioOutput が null）ときは何もしない", () => {
    expect(() => playWheelClick(1)).not.toThrow();
    expect(() => playWheelOpen()).not.toThrow();
  });

  it("開くポンは1音なので、起きる前でも積む（起きたらすぐ鳴る）", () => {
    const audio = fakeAudio("suspended");
    output.current = { audio, out: {} };
    playWheelOpen();
    expect(audio.made.oscillators.length).toBeGreaterThan(0);
  });
});
