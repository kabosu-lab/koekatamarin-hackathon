import { schedulePop } from "@/lib/send-sound";
import { audioOutput } from "./sound";

/**
 * ホイールの「カリ」（設計書 §2-1-C 4）。乾いた低めのラチェットの音。
 * 20ms の雑音を AudioContext ごとに1回だけ作り、使い回す（鳴らすたびに作らない）。
 */
const clickBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function clickBuffer(audio: BaseAudioContext): AudioBuffer {
  const cached = clickBuffers.get(audio);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(audio.sampleRate * 0.02));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  clickBuffers.set(audio, buffer);
  return buffer;
}

function scheduleClick(audio: BaseAudioContext, out: AudioNode, at: number): void {
  // 雑音の「カッ」：低めの帯域に絞って乾いた手触りにする
  const noise = audio.createBufferSource();
  noise.buffer = clickBuffer(audio);
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2000;
  band.Q.value = 1.5;
  const level = audio.createGain();
  level.gain.setValueAtTime(0, at);
  level.gain.linearRampToValueAtTime(0.12, at + 0.001);
  level.gain.setTargetAtTime(0, at + 0.001, 0.006);
  noise.connect(band).connect(level).connect(out);
  noise.start(at);
  noise.stop(at + 0.025);

  // 下に短い低い音を重ねて「歯」の感じ
  const tooth = audio.createOscillator();
  tooth.type = "sine";
  tooth.frequency.value = 600;
  const toothLevel = audio.createGain();
  toothLevel.gain.setValueAtTime(0.06, at);
  toothLevel.gain.setTargetAtTime(0, at + 0.002, 0.003);
  tooth.connect(toothLevel).connect(out);
  tooth.start(at);
  tooth.stop(at + 0.008);
}

/** カリを count 回（最大3回）。速くなぞると細かく連なる。音の設定が「on」でなければ鳴らさない */
export function playWheelClick(count = 1): void {
  const output = audioOutput();
  if (!output) return;
  const { audio, out } = output;
  const times = Math.max(0, Math.min(3, Math.floor(count)));
  try {
    for (let i = 0; i < times; i++) scheduleClick(audio, out, audio.currentTime + 0.02 + i * 0.012);
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}

/** 真ん中のチップが開くときのポン（カリと違う音色で「決まった」を伝える） */
export function playWheelOpen(): void {
  const output = audioOutput();
  if (!output) return;
  try {
    schedulePop(output.audio, output.out, output.audio.currentTime + 0.02, 84, 0.2);
  } catch {
    // 音が出せなくても、開くのには関係ない
  }
}
