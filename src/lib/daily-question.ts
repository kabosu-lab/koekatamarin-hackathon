import { isNoticeHours } from "./inbox";

const MORNING = ["今日、楽しみにしていることはありますか？", "最近ちょっと気になっていることはありますか？"];
const EVENING = ["今日いちばん頑張ったのは？", "今日、誰かに助けられたことはありましたか？"];

/**
 * 投稿の理由をアプリが作る、1つだけの問いかけ。夕方と朝で変わり、同じ日は同じ。
 * 通知してよい時間の外には出さない。押しつけないよう、最初の画面にそっと出すだけ。
 */
export function dailyQuestion(now: Date): string | null {
  if (!isNoticeHours(now)) return null;
  const [year, month, day, hour] = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  })
    .format(now)
    .split(/[-\s:]/)
    .map(Number);
  const list = hour >= 15 ? EVENING : MORNING;
  return list[(year + month + day) % list.length];
}
