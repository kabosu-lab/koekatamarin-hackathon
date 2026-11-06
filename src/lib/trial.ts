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

/**
 * 試用で触る人。生徒用と先生用は、別の合言葉・別のポートで動かす（scripts/trial.mjs）。
 * 指定がなければ生徒として扱う（いちばん控えめな側）。
 */
export function trialAudience(): "student" | "teacher" | null {
  if (!isTrialMode()) return null;
  return process.env.KOEKATA_TRIAL_AUDIENCE === "teacher" ? "teacher" : "student";
}

/** 人物の切り替えで生徒だけを選べるか。先生用の試用では先生も選べる。 */
export function onlyStudentsSelectable(): boolean {
  return trialAudience() === "student";
}

/** 話した言葉をサーバーに残してよいか。生徒の試用では、覚えさせることもできない。 */
export function keepsSpokenWords(): boolean {
  return trialAudience() !== "student";
}

/** 試用で Teams へ送るときに使うダミーの人物（そのトークンで送る）。なければ試用では送らない。 */
export function trialTeamsSender(): string | null {
  if (!isTrialMode()) return null;
  return process.env.KOEKATA_TRIAL_TEAMS_AS?.trim() || null;
}

/** 試用で Teams へ送るか。送る人が決まっていて、Teams を止めていないときだけ */
export function trialSendsToTeams(): boolean {
  return trialTeamsSender() !== null && process.env.KOEKATA_TEAMS !== "off";
}

/**
 * 試用の注意。最初に1回だけ、スクロールなしで全部読めるカードに出す（iPhone の幅で4行まで）。
 * Teams へ送らない試用（審査員用など）では、Teams のことを書かない。
 */
export function trialNotice(): string {
  const teams = trialSendsToTeams() ? "投稿は練習用の Teams にも届きます。" : "";
  return `試用版です。名前や個人の情報は書かないでね。書いたことは、試している人どうしで見えます。${teams}相談室には届かないので、本当に困ったことは先生や近くの大人へ。`;
}

export const TRIAL_PROMISE_FULL =
  "試用なので、ここで話したことは相談室にも先生にも届きません。ただし、投稿やパートナーに覚えさせたことは、試している人に見えることがあります。本当に困ったことは、先生や近くの大人に直接話してください。";

export const TRIAL_PROMISE_SHORT = "相談室にも先生にも届きません。投稿や覚えさせたことは、試している人に見えることがあります。困ったことは先生や近くの大人へ。";

export const TRIAL_SAFETY_SPEECH =
  "大事な話やと思う。これは試用やから、相談室にも先生にも届いてないよ。先生か近くの大人に、直接話してね。今すぐ話したいときは、画面の窓口につながるよ。すぐ危ないときは、110番か119番に電話してね。";
