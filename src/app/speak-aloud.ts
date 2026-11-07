import { splitSentences } from "@/lib/echo";
import { noteSpeechEnded, noteSpoken } from "./speech";

/** 読み上げの速さ（0-3l：1 ではゆっくりすぎた） */
export const SPEECH_RATE = 1.15;
/** 話し終えてから聞き取りを戻すまでの間。スピーカーの残り音を拾わない */
export const RESUME_GAP_MS = 500;
/** 終わりの知らせが来ない端末のための保険。1字あたりの長さと、最低の長さ */
const MS_PER_CHAR = 260;
const MIN_TIMEOUT_MS = 6000;
const POLL_MS = 200;

/** 読み上げ中の発話。Chrome は参照が切れた発話の終わりの知らせを落とすことがあるので、ここで持っておく */
const speaking = new Set<SpeechSynthesisUtterance>();
let queue: Promise<void> = Promise.resolve();
/** やめたときに増やす。待っていた読み上げも読まない */
let generation = 0;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function speakNow(text: string, turn: number): Promise<void> {
  if (turn !== generation) return;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return;
  noteSpoken(text);
  const utterances = sentences.map((sentence) => {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = "ja-JP";
    utterance.rate = SPEECH_RATE;
    return utterance;
  });
  const ended = utterances.map(
    (utterance) =>
      new Promise<void>((resolve) => {
        const done = () => {
          speaking.delete(utterance);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
      }),
  );
  // 最初の一文をすぐ読み始め、残りはそのあとに続ける
  for (const utterance of utterances) {
    speaking.add(utterance);
    speechSynthesis.speak(utterance);
  }
  const limit = Math.max(MIN_TIMEOUT_MS, (text.length * MS_PER_CHAR) / SPEECH_RATE);
  const timedOut = await Promise.race([Promise.all(ended).then(() => false), wait(limit).then(() => true)]);
  if (timedOut) {
    // 知らせが来ないまま長く経った。声を止めてから聞き取りに戻す（話しながら聞かない）
    speechSynthesis.cancel();
    utterances.forEach((utterance) => speaking.delete(utterance));
  }
  // 終わりの知らせが早く来る端末がある。本当に声が止まるまで待つ
  const until = Date.now() + 3000;
  while (speechSynthesis.speaking && Date.now() < until) await wait(POLL_MS);
  noteSpeechEnded();
  await wait(RESUME_GAP_MS);
}

/**
 * 声で読む。文ごとに分けて、最初の一文から読み始める。読み上げが重なったら順に読む（捨てない）。
 * 終わるのは、声が止まってから少し間をおいたとき。聞き取りはその間止めておく（呼ぶ側）。
 */
export function speakAloud(text: string): Promise<void> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  const turn = generation;
  const next = queue.then(() => speakNow(text, turn)).catch(() => undefined);
  queue = next;
  return next;
}

/** 画面を離れるときなど。読んでいる声も、待っている読み上げもやめる */
export function cancelAloud(): void {
  generation += 1;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
