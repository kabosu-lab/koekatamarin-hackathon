/**
 * サンクスカードの種類（0-2j(4)）。送る人には選ばせず、言葉から読み取って絵柄を変える。
 * 画面の部品からも使うので、ここにはサーバーだけの物を入れない。
 */
export type ThanksKind = "thanks" | "effort" | "congrats";

export const THANKS_KINDS: Record<ThanksKind, { label: string; icon: "heart" | "flag" | "star" }> = {
  thanks: { label: "ありがとう", icon: "heart" },
  effort: { label: "がんばったね", icon: "flag" },
  congrats: { label: "おめでとう", icon: "star" },
};

/**
 * 投稿の種類に合う入口の言葉（0-2j）。頑張りには「おめでとう」、お知らせと報告には「ありがとう」。
 * 困りごと・悩みには置かない（返事で応える）
 */
export function thanksEntryLabel(kind: string): "ありがとう" | "おめでとう" | null {
  return kind === "effort" ? "おめでとう" : kind === "notice" || kind === "report" ? "ありがとう" : null;
}

/** はっきりした言葉を先に見て、次に弱い手がかりを見る。どれもなければ、ありがとう */
const RULES: readonly [RegExp, ThanksKind][] = [
  [/おめでと|祝/, "congrats"],
  [/ありがと|ありがた|助か|感謝|さんきゅー|おかげ/, "thanks"],
  [/頑張|がんば|お疲れ|おつかれ|努力/, "effort"],
  [/合格|優勝|入賞|受賞|当選|金賞|銀賞|銅賞|やったね|誕生日/, "congrats"],
  [/続けて|続けた|やりきった|やり切った|粘り|すごかった|えらい/, "effort"],
];

export function readThanksKind(message: string): ThanksKind {
  // 半角・全角をそろえ、カタカナはひらがなにして比べる（「オメデトウ」「アリガト」も当たる）
  const text = message.normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  for (const [pattern, kind] of RULES) if (pattern.test(text)) return kind;
  return "thanks";
}

/** 届いたときの知らせ。ありがとうのときは今までと同じ文 */
export function sentNotice(name: string, kind: ThanksKind): string {
  return kind === "thanks" ? `${name}さんに、ありがとうが届きました。` : `${name}さんに、「${THANKS_KINDS[kind].label}」が届きました。`;
}

/** 0-3a：話す画面のパートナーの「ありがとうが届いています」。押すとその場で封筒が開く */
export const THANKS_REVEAL_HREF = "#thanks-reveal";
export const THANKS_REVEAL_EVENT = "koekata:thanks-reveal";
