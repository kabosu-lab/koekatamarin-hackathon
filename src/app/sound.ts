import { splitIntoWords } from "@/lib/lumps";
import { type DeliverLevel, scheduleCommitPop, scheduleCommitRun, schedulePop, scheduleReadyChord, scheduleSendSound } from "@/lib/send-sound";

const MASTER_GAIN = 0.5;
const ECHO_GAIN = 0.18;

let shared: { audio: AudioContext; out: AudioNode } | null = null;

/**
 * 音を鳴らしてよいか。判定はここ1か所だけ（0-1v）。アプリの中に「音を消す」はなく、いつも鳴らす。
 * 音を切るのは端末の消音や音量で（iPhone・iPad は下の audioSession で消音スイッチに従う）。
 */
export function soundAllowed(): boolean {
  return typeof document !== "undefined";
}

function setup() {
  if (shared) return shared;
  // 対応する端末（iOS Safari など）では、ほかの音楽を止めず、消音スイッチに従う種類にする
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) {
    try {
      session.type = "ambient";
    } catch {
      // 設定できなくても鳴らせる
    }
  }
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

/**
 * ほかの部品が自分の音を鳴らすための口（ホイールのカリ、ポン、和音）。
 * 音の設定が「on」のときだけ返す。判定はここに1つにまとめる（0-1m：判定の食い違いをなくす）。
 */
export function audioOutput(): { audio: AudioContext; out: AudioNode } | null {
  if (!soundAllowed()) return null;
  try {
    const output = setup();
    void output.audio.resume();
    return output;
  } catch {
    return null;
  }
}

// スマホでは、指で触れた時に音を起こしておかないと、通信のあとに鳴らせない
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      if (!soundAllowed()) return;
      try {
        void setup().audio.resume();
      } catch {
        // 音が出せなくても、操作には関係ない
      }
    },
    { passive: true },
  );

  // 0-2o(3)：iPhone の Safari は、なぞる（ドラッグ）だけの pointerdown では音を起こせない。
  // 指を離したとき（touchend・pointerup・click）に起こし、無音を1回鳴らして、以後の音を通す。
  // 起きたと分かるまでは、離すたびに試す（最初の操作が許可にならない端末もあるため）。
  let unlocked = false;
  const wake = () => {
    if (unlocked || !soundAllowed()) return;
    try {
      const { audio } = setup();
      const silent = audio.createBufferSource();
      silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
      silent.connect(audio.destination);
      silent.start(0);
      void audio.resume().then(() => {
        if (audio.state === "running") unlocked = true;
      });
    } catch {
      // 音が出せなくても、操作には関係ない
    }
  };
  for (const type of ["touchend", "pointerup", "click"] as const) {
    document.addEventListener(type, wake, { passive: true, capture: true });
  }
}

/** 送ったときの音。動きと同じ時刻で鳴らす。音を消している人には鳴らさない。 */
export function playSendSound(words: string): void {
  if (!soundAllowed()) return;
  try {
    const { audio, out } = setup();
    void audio.resume();
    // モダンは小さな音1つだけ
    if (document.documentElement.dataset.theme === "modern") {
      schedulePop(audio, out, audio.currentTime + 0.02, 79, 0.2);
      return;
    }
    scheduleSendSound(audio, out, audio.currentTime + 0.02, splitIntoWords(words).length);
  } catch {
    // 音が出せなくても、送るのには関係ない
  }
}

/** 人に届いた瞬間の小さな音（応援、返信、ありがとう）。音を消している人には鳴らさない。 */
/** リボンが贈られた瞬間のファンファーレ。短く、同じ調で上がる。 */
export function playRibbonSound(): void {
  if (!soundAllowed()) return;
  try {
    const { audio, out } = setup();
    void audio.resume();
    const t0 = audio.currentTime + 0.02;
    [
      [0, 72, 0.4],
      [0.1, 76, 0.42],
      [0.2, 79, 0.45],
      [0.32, 84, 0.5],
      [0.32, 76, 0.3],
      [0.52, 88, 0.42],
    ].forEach(([delay, note, volume]) => schedulePop(audio, out, t0 + delay, note, volume));
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}

/** ホイールを回したときの小さな音。 */
export function playWheelTick(): void {
  if (!soundAllowed()) return;
  try {
    const { audio, out } = setup();
    void audio.resume();
    schedulePop(audio, out, audio.currentTime + 0.005, 96, 0.08);
  } catch {
    // 音が出せなくても、操作には関係ない
  }
}

export function playReachedSound(): void {
  if (!soundAllowed()) return;
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

/**
 * 声が1区切り固まったときのやわらかい「ポン」。step（1 から）ごとに音階が1段上がる。
 * 木琴の音色で、ホイールの「カリ」とは別。音の設定が「on」のときだけ鳴る。
 * 0-2m で、話している間の音は playCommitRun（話し終えたあとにまとめて鳴らす）へ移す。本体が移し終えたら消してよい。
 */
export function playCommitPop(step: number): void {
  const output = audioOutput();
  if (!output) return;
  try {
    scheduleCommitPop(output.audio, output.out, output.audio.currentTime + 0.02, step);
  } catch {
    // 音が出せなくても、話すのには関係ない
  }
}

/**
 * 話し終えて指を離したあとの「ポンポンポン…」（0-2m）。count はその会話で話した回数。
 * 1回目は1つ、話すたびに増え、上限で止まる。とどけるの最後の音へ向かって上がる。
 * 話している間（onCommitted のたび）には鳴らさず、離して送ったときに1回だけ呼ぶ。
 * やわらかい鈴の音色。判定は audioOutput() の1か所。
 */
export function playCommitRun(count: number): void {
  const output = audioOutput();
  if (!output) return;
  try {
    scheduleCommitRun(output.audio, output.out, output.audio.currentTime + 0.02, count);
  } catch {
    // 音が出せなくても、話すのには関係ない
  }
}

/** とどけるの段が上がった瞬間の締めの和音。段が上がるほど豊かになる。0 では鳴らさない。 */
export function playReadyChord(level: DeliverLevel): void {
  if (level <= 0) return;
  const output = audioOutput();
  if (!output) return;
  try {
    scheduleReadyChord(output.audio, output.out, output.audio.currentTime + 0.02, level);
  } catch {
    // 音が出せなくても、話すのには関係ない
  }
}
