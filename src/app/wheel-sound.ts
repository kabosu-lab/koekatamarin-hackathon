import { schedulePop } from "@/lib/send-sound";
import { audioOutput } from "./sound";

/**
 * ホイールの「カリ」（設計書 §2-1-C 4）。乾いたラチェットの音。iPhone のスピーカーでも聞こえるよう、
 * 帯域は 3kHz、歯は 800Hz、音量 0.3・長さ約 28ms にする（0-2w。前の 2kHz・600Hz・0.12・20ms（減衰 6ms）・歯 0.06 で 8ms は、
 * iPhone でもパソコンでもほぼ聞こえなかった）。雑音は AudioContext ごとに1回だけ作り、使い回す（鳴らすたびに作らない）。
 */
/** カリの帯域・音量・長さと、歯の高さ・音量・長さ（0-2w） */
export const CLICK_BAND_HZ = 3000;
export const CLICK_GAIN = 0.3;
export const CLICK_SECONDS = 0.028;
export const TOOTH_HZ = 800;
export const TOOTH_GAIN = 0.15;
export const TOOTH_SECONDS = 0.025;

const clickBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function clickBuffer(audio: BaseAudioContext): AudioBuffer {
  const cached = clickBuffers.get(audio);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(audio.sampleRate * CLICK_SECONDS));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  clickBuffers.set(audio, buffer);
  return buffer;
}

function scheduleClick(audio: BaseAudioContext, out: AudioNode, at: number): void {
  // 雑音の「カッ」：3kHz の帯域に絞って乾いた手触りにする
  const noise = audio.createBufferSource();
  noise.buffer = clickBuffer(audio);
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = CLICK_BAND_HZ;
  band.Q.value = 1.5;
  const level = audio.createGain();
  level.gain.setValueAtTime(0, at);
  level.gain.linearRampToValueAtTime(CLICK_GAIN, at + 0.001);
  level.gain.setTargetAtTime(0, at + 0.001, 0.009);
  noise.connect(band).connect(level).connect(out);
  noise.start(at);
  noise.stop(at + CLICK_SECONDS);

  // 下に短い音を重ねて「歯」の感じ（長さに合わせて減衰もゆっくりにする）
  const tooth = audio.createOscillator();
  tooth.type = "sine";
  tooth.frequency.value = TOOTH_HZ;
  const toothLevel = audio.createGain();
  toothLevel.gain.setValueAtTime(TOOTH_GAIN, at);
  toothLevel.gain.setTargetAtTime(0, at + 0.002, 0.007);
  tooth.connect(toothLevel).connect(out);
  tooth.start(at);
  tooth.stop(at + TOOTH_SECONDS);
}

/**
 * カリを count 回（最大3回）。速くなぞると細かく連なる。
 * 音がまだ起きていない（running でない）ときは積まずに捨てる。止まった context に積むと、
 * 起きた瞬間（指を離したとき）に溜まった分が塊で鳴ってしまう（0-2w）。
 */
export function playWheelClick(count = 1): void {
  const output = audioOutput();
  if (!output) return;
  const { audio, out } = output;
  if (audio.state !== "running") return;
  const times = Math.max(0, Math.min(3, Math.floor(count)));
  try {
    for (let i = 0; i < times; i++) scheduleClick(audio, out, audio.currentTime + 0.02 + i * 0.012);
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}

/** 真ん中のチップが開くときのポン（カリと違う音色で「決まった」を伝える）。1音だけなので、起きる前でも積んでおき、起きたらすぐ鳴らす */
export function playWheelOpen(): void {
  const output = audioOutput();
  if (!output) return;
  try {
    schedulePop(output.audio, output.out, output.audio.currentTime + 0.02, 84, 0.2);
  } catch {
    // 音が出せなくても、開くのには関係ない
  }
}
