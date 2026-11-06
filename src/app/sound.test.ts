import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** 起こす口（wakeAudio）を確かめるための、記録するだけの AudioContext の偽物。 */
class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state: string = "suspended";
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  resumes = 0;
  silents = 0;
  constructor() {
    FakeAudioContext.last = this;
  }
  resume() {
    this.resumes++;
    return Promise.resolve();
  }
  createGain() {
    return { gain: { value: 0 }, connect: (next: unknown) => next };
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(16) };
  }
  createConvolver() {
    return { buffer: null, connect: (next: unknown) => next };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: (next: unknown) => next,
      start: () => {
        this.silents++;
      },
    };
  }
}

let listeners: { type: string; options: unknown }[] = [];

async function loadSound() {
  vi.resetModules();
  listeners = [];
  FakeAudioContext.last = null;
  vi.stubGlobal("document", {
    addEventListener: (type: string, _listener: unknown, options: unknown) => listeners.push({ type, options }),
    documentElement: { dataset: {} },
  });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return import("./sound");
}

describe("音を起こす口（0-2w）", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("押す・なぞって離す・打つの、どれが最初でも起こす合図にする", async () => {
    const sound = await loadSound();
    const types = listeners.map((entry) => entry.type);
    for (const type of ["pointerdown", "touchend", "pointerup", "click", "keydown"]) {
      expect(types).toContain(type);
    }
    expect(types).toEqual([...sound.WAKE_EVENTS]);
    // 起こす口は1つだけ（同じ合図に2つ登録しない）
    expect(new Set(types).size).toBe(types.length);
  });

  it("止まっているときは無音を1回鳴らしてから起こす", async () => {
    const sound = await loadSound();
    sound.wakeAudio();
    const audio = FakeAudioContext.last!;
    expect(audio.silents).toBe(1);
    expect(audio.resumes).toBe(1);
  });

  it("起きているときは何もしない", async () => {
    const sound = await loadSound();
    sound.wakeAudio();
    const audio = FakeAudioContext.last!;
    audio.state = "running";
    sound.wakeAudio();
    expect(audio.silents).toBe(1);
    expect(audio.resumes).toBe(1);
  });

  it("一度起きたあとに止まっても（録音・電話など）、次の操作でまた起こす", async () => {
    const sound = await loadSound();
    sound.wakeAudio();
    const audio = FakeAudioContext.last!;
    audio.state = "running";
    sound.wakeAudio();
    audio.state = "interrupted";
    sound.wakeAudio();
    expect(audio.resumes).toBe(2);
    expect(audio.silents).toBe(2);
  });

  it("音を鳴らす口は、止まっていれば起こし、起きていれば resume を呼ばない", async () => {
    const sound = await loadSound();
    const output = sound.audioOutput();
    expect(output).not.toBeNull();
    const audio = FakeAudioContext.last!;
    expect(audio.resumes).toBe(1);
    audio.state = "running";
    sound.audioOutput();
    expect(audio.resumes).toBe(1);
  });

  it("AudioContext は1つだけ作る", async () => {
    const sound = await loadSound();
    sound.wakeAudio();
    const first = FakeAudioContext.last;
    sound.audioOutput();
    sound.wakeAudio();
    expect(FakeAudioContext.last).toBe(first);
  });
});
