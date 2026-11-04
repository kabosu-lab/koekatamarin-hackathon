/**
 * 一時公開の試用モード。合言葉（KOEKATA_ACCESS_CODE）があるときだけ有効になる。
 * 試用では相談室にも先生にも何も届かないので、届くと読める表示を出さない。投稿や覚えたことは試している人どうしで見えることがある。
 * 画面の部品からも読むので、サーバー専用の処理をここに置かない。
 */
export function accessCode(): string | null {
  return process.env.KOEKATA_ACCESS_CODE?.trim() || null;
}

export function isTrialMode(): boolean {
  return accessCode() !== null;
}

export const TRIAL_NOTICE =
  "先生や相談室には届きません。投稿や相棒に覚えさせたことは、試している人に見えることがあります。実名や個人情報は入れないでください。本当に困ったことは先生へ。";

export const TRIAL_PROMISE_FULL =
  "試用なので、ここで話したことは相談室にも先生にも届きません。ただし、投稿や相棒に覚えさせたことは、試している人に見えることがあります。本当に困ったことは、先生や近くの大人に直接話してください。";

export const TRIAL_PROMISE_SHORT = "相談室にも先生にも届きません。投稿や覚えさせたことは、試している人に見えることがあります。困ったことは先生や近くの大人へ。";

export const TRIAL_SAFETY_SPEECH =
  "大事な話やと思う。これは試用やから、相談室にも先生にも届いてないよ。先生か近くの大人に、直接話してね。今すぐ話したいときは、画面の窓口につながるよ。すぐ危ないときは、110番か119番に電話してね。";
