import { splitIntoWords } from "@/lib/lumps";
import { schedulePop, scheduleSendSound } from "@/lib/send-sound";

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

/** 送ったときの音。動きと同じ時刻で鳴らす。音を消している人には鳴らさない。 */
export function playSendSound(words: string): void {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const { audio, out } = setup();
    void audio.resume();
    scheduleSendSound(audio, out, audio.currentTime + 0.02, splitIntoWords(words).length);
  } catch {
    // 音が出せなくても、送るのには関係ない
  }
}

/** 人に届いた瞬間の小さな音（応援、返信、ありがとう）。音を消している人には鳴らさない。 */
export function playReachedSound(): void {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const { audio, out } = setup();
    void audio.resume();
    const t0 = audio.currentTime + 0.02;
    schedulePop(audio, out, t0, 79, 0.4);
    schedulePop(audio, out, t0 + 0.09, 84, 0.45);
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}
