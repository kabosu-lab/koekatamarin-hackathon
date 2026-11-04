import { sendTiming, splitIntoWords } from "@/lib/lumps";

/** すべての音をハ長調のペンタトニックにそろえ、続けて鳴っても濁らないようにする。 */
const WORD_NOTES = [72, 74, 76, 79, 81];
const GATHER_NOTES = [84, 86, 88, 91];
const LAND_NOTES: [number, number][] = [
  [0, 72],
  [0.08, 76],
  [0.16, 79],
  [0.26, 84],
];
const MASTER_GAIN = 0.5;
const ECHO_GAIN = 0.18;

let shared: { audio: AudioContext; out: AudioNode } | null = null;

function setup() {
  if (shared) return shared;
  const audio = new AudioContext();
  const master = audio.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(audio.destination);

  // 短い残響：減衰する雑音を畳み込む
  const length = Math.floor(audio.sampleRate * 0.3);
  const impulse = audio.createBuffer(1, length, audio.sampleRate);
  const samples = impulse.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const echo = audio.createConvolver();
  echo.buffer = impulse;
  const echoLevel = audio.createGain();
  echoLevel.gain.value = ECHO_GAIN;
  echo.connect(echoLevel).connect(master);

  const out = audio.createGain();
  out.connect(master);
  out.connect(echo);
  shared = { audio, out };
  return shared;
}

// スマホでは、指で触れた時に音を起こしておかないと、通信のあとに鳴らせない
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      if (document.documentElement.dataset.sound !== "on") return;
      try {
        void setup().audio.resume();
      } catch {
        // 音が出せなくても、操作には関係ない
      }
    },
    { passive: true },
  );
}

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** 木琴に近い音：鳴り始めだけ明るく、すぐ落ち着く（FM）。 */
function pop(at: number, note: number, volume: number) {
  const { audio, out } = setup();
  const frequency = hz(note);
  const carrier = audio.createOscillator();
  carrier.frequency.setValueAtTime(frequency * 1.12, at);
  carrier.frequency.exponentialRampToValueAtTime(frequency, at + 0.03);

  const modulator = audio.createOscillator();
  modulator.frequency.value = frequency * 3.5;
  const depth = audio.createGain();
  depth.gain.setValueAtTime(frequency * 2.4, at);
  depth.gain.exponentialRampToValueAtTime(1, at + 0.12);
  modulator.connect(depth).connect(carrier.frequency);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  carrier.connect(gain).connect(out);

  for (const tone of [carrier, modulator]) {
    tone.start(at);
    tone.stop(at + 0.24);
  }
}

/** シューン：高さが上がっていく雑音。 */
function whoosh(at: number, duration: number, volume: number) {
  const { audio, out } = setup();
  const length = Math.floor(audio.sampleRate * duration);
  const noise = audio.createBuffer(1, length, audio.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  source.buffer = noise;

  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(500, at);
  filter.frequency.exponentialRampToValueAtTime(5700, at + duration);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + duration * 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
}

/** 送ったときの音：ポポポ（言葉）、シューン（飛ぶ）、ポン（届く）。「音あり」を選んだ人にだけ鳴らす。 */
export function playSendSound(words: string): void {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const { audio } = setup();
    void audio.resume();
    const count = splitIntoWords(words).length;
    const timing = sendTiming(count);
    const t0 = audio.currentTime + 0.02;
    for (let i = 0; i < count; i++) pop(t0 + i * timing.popGap, WORD_NOTES[i], 0.55);
    GATHER_NOTES.forEach((note, i) => pop(t0 + timing.gather + i * 0.05, note, 0.18));
    pop(t0 + timing.launch, 60, 0.5);
    whoosh(t0 + timing.launch, timing.land - timing.launch, 0.9);
    pop(t0 + timing.land, 60, 0.7);
    for (const [delay, note] of LAND_NOTES) pop(t0 + timing.land + delay, note, 0.45);
  } catch {
    // 音が出せなくても、送るのには関係ない
  }
}

/** 人に届いた瞬間の小さな音（応援、返信、ありがとう）。「音あり」を選んだ人にだけ鳴らす。 */
export function playReachedSound(): void {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const { audio } = setup();
    void audio.resume();
    const t0 = audio.currentTime + 0.02;
    pop(t0, 79, 0.4);
    pop(t0 + 0.09, 84, 0.45);
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}
