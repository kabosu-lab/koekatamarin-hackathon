/**
 * パートナーをタップしたときの話しかけ（0-2a）と、最初の問いかけ（0-1g(1)）の一覧と選び方。
 * Claude は呼ばない。時刻・生徒か先生か・初めてか・頑張りたいこと・何回目か、から手元の一覧で選ぶ。
 * 乱数は使わず、同じ入力なら同じ一言になる（テストで確かめられるように）。
 *
 * 種類は3つ：問いかけ（ask）・操作の案内（guide）・アプリの説明（about）。
 * - 0回目（最初の吹き出し）はいつも問いかけ
 * - 慣れた人：問いかけ → 説明 → 案内 を順に回す（偏らない）
 * - 初めての人：問いかけ → 案内 → 説明 → 案内 を回す（案内が半分）
 * - 同じ種類は続かないので、同じ一言も続かない。さらに recent にある一言は避ける
 *
 * 生徒には今までどおりくだけた口調。先生にはいつもです・ます調のやわらかい丁寧語（0-2c）。
 * 命や安全の決まりのため、秘密を約束する・相談の窓口のように振る舞う一言は入れない。
 */

export type PartnerAudience = "student" | "teacher";
/** news：新着の知らせ（0-2v）。押すとその画面へ行く */
export type PartnerLineKind = "ask" | "guide" | "about" | "news";
export type TimeOfDay = "morning" | "noon" | "afterschool" | "night";

export interface PartnerLine {
  text: string;
  kind: PartnerLineKind;
}

export interface PartnerLineInput {
  /** 日本時間の時（0〜23）。Date からは partnerHour() で作る */
  hour: number;
  /** seed-data の Role。"admin" は先生として扱う */
  role: "student" | "teacher" | "admin" | PartnerAudience;
  /** 初めて使う人か（まだ一度も話していない、など。判定は本体が持つ） */
  firstTime: boolean;
  /** 今の頑張りたいこと（なければ null） */
  goal?: string | null;
  /** これまでのタップの回数。0 は最初の吹き出し */
  tapCount: number;
  /** 直前に出した一言（新しいものを後ろに、2〜3個） */
  recent?: readonly string[];
}

/** 誘いの一言（0-1g(2)）。数秒触られなかったときに添える */
export const INVITE_LINE: Record<PartnerAudience, string> = {
  student: "押しながら話してね。打ってもいいよ",
  teacher: "押しながら話してください。打っても大丈夫です",
};

/** 頑張りたいことを吹き出しに入れるのは、この字数まで（全部見える長さにするため） */
const GOAL_MAX = 14;

const ASK_BY_TIME: Record<PartnerAudience, Record<TimeOfDay, string[]>> = {
  student: {
    morning: ["今日はどんな一日にしたい？", "今日、楽しみなことある？"],
    noon: ["午前中、何かおもしろいことあった？", "お昼、ちょっとひと息つけた？"],
    afterschool: ["今日いちばん頑張ったのは？", "今日、誰かに助けられたことは？"],
    night: ["今日をひとことで言うと？", "今日、いい時間はあった？"],
  },
  teacher: {
    morning: ["今日、楽しみにしていることはありますか？", "今朝の気分はいかがですか？"],
    noon: ["午前中、印象に残ったことはありますか？", "お昼、少しひと息つけましたか？"],
    afterschool: ["今日いちばん頑張ったことは何ですか？", "今日、誰かに助けられたことはありましたか？"],
    night: ["今日もお疲れさまでした。どんな一日でしたか？", "今日、よかった時間はありましたか？"],
  },
};

const ASK_ANYTIME: Record<PartnerAudience, string[]> = {
  student: ["最近うまくいったこと、ある？", "ちょっと困ってることは？"],
  teacher: ["最近うまくいったことはありますか？", "少し困っていることはありますか？"],
};

const GOAL_ASK: Record<PartnerAudience, (goal: string) => string> = {
  student: (goal) => `「${goal}」、最近はどう？`,
  teacher: (goal) => `「${goal}」、最近はいかがですか？`,
};

const GOAL_ASK_SHORT: Record<PartnerAudience, string> = {
  student: "頑張りたいこと、最近はどう？",
  teacher: "頑張りたいこと、最近はいかがですか？",
};

const ABOUT: Record<PartnerAudience, string[]> = {
  student: [
    "あなたの思いを形にするよ",
    "困ってること、ない？ 誰かが助けてくれるかも",
    "日記を一緒につけるよ",
    "そのアイデア、ほかの人の役に立つかも",
    "あなたの頑張り、ちゃんと記録しておくよ",
    "それ、ほかの誰かも困ってることかもしれないよ",
    "話してくれたら、言葉にするのを手伝うよ",
    "届けるかは、あなたが決めてね",
  ],
  teacher: [
    "思っていることを、一緒に形にします",
    "困っていることはありませんか？ 誰かが助けてくれるかもしれません",
    "今日の日報、まとめておきますね",
    "そのアイデア、ほかの先生の役に立つかもしれません",
    "頑張りを、ちゃんと記録しておきますね",
    "それ、ほかの誰かも困っていることかもしれません",
    "話してくだされば、言葉にするのを手伝います",
    "届けるかどうかは、ご自身で決めてくださいね",
  ],
};

const GUIDE: Record<PartnerAudience, string[]> = {
  student: [
    INVITE_LINE.student,
    "ホイールをなぞると、ほかの場所へ行けるよ",
    // 0-3i：なぞれる輪だと分かるように
    "輪をなぞると、いろいろ開けるよ",
    "左右にすべらせると、みんなと履歴に行けるよ",
    "手を離しても聞いてほしいときは、指をずらしてね",
  ],
  teacher: [
    INVITE_LINE.teacher,
    "ホイールをなぞると、ほかの場所へ行けます",
    "輪をなぞると、いろいろ開けます",
    "左右にすべらせると、みんなと履歴に行けます",
    "手を離しても聞いてほしいときは、指をずらしてください",
  ],
};

const CYCLE_REGULAR: readonly PartnerLineKind[] = ["ask", "about", "guide"];
const CYCLE_FIRST: readonly PartnerLineKind[] = ["ask", "guide", "about", "guide"];

export function audienceOf(role: PartnerLineInput["role"]): PartnerAudience {
  return role === "student" ? "student" : "teacher";
}

/**
 * 時刻の区切り。前提：朝 5〜9時台、昼 10〜14時台、放課後 15〜17時台、夜 18〜翌4時台。
 */
export function timeOfDay(hour: number): TimeOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 15) return "noon";
  if (h >= 15 && h < 18) return "afterschool";
  return "night";
}

/** Date を日本時間の時（0〜23）にする（daily-question.ts と同じ、Asia/Tokyo 基準） */
export function partnerHour(now: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}

/** 何回目のタップが、どの種類の一言になるか */
export function partnerLineKind(tapCount: number, firstTime: boolean): PartnerLineKind {
  const cycle = firstTime ? CYCLE_FIRST : CYCLE_REGULAR;
  const n = Math.max(0, Math.floor(tapCount));
  return cycle[n % cycle.length];
}

/** その人・その時刻に出しうる一言の一覧（種類ごと） */
export function partnerLinePool(input: Pick<PartnerLineInput, "hour" | "role" | "goal">, kind: PartnerLineKind): string[] {
  const audience = audienceOf(input.role);
  if (kind === "guide") return GUIDE[audience];
  if (kind === "about") return ABOUT[audience];
  const goal = input.goal?.trim();
  const goalLine = goal ? (goal.length <= GOAL_MAX ? GOAL_ASK[audience](goal) : GOAL_ASK_SHORT[audience]) : null;
  const timed = ASK_BY_TIME[audience][timeOfDay(input.hour)];
  // 時刻の問いかけを先に置く（最初の吹き出しが時刻で変わるように）。頑張りたいことはその次に回る
  return [timed[0], ...(goalLine ? [goalLine] : []), timed[1], ...ASK_ANYTIME[audience]];
}

/** 次の一言と種類。同じ入力なら同じ答え */
export function nextPartnerLine(input: PartnerLineInput): PartnerLine {
  const kind = partnerLineKind(input.tapCount, input.firstTime);
  const pool = partnerLinePool(input, kind);
  const cycleLength = input.firstTime ? CYCLE_FIRST.length : CYCLE_REGULAR.length;
  const n = Math.max(0, Math.floor(input.tapCount));
  // 同じ種類が何周目か。案内が1周に2回ある初めての人は、その中でも別の一言にする
  const slotsPerCycle = input.firstTime && kind === "guide" ? 2 : 1;
  const round = Math.floor(n / cycleLength) * slotsPerCycle + (slotsPerCycle === 2 && n % cycleLength === 3 ? 1 : 0);
  const recent = new Set(input.recent ?? []);
  for (let step = 0; step < pool.length; step++) {
    const text = pool[(round + step) % pool.length];
    if (!recent.has(text)) return { text, kind };
  }
  return { text: pool[round % pool.length], kind };
}

/** 今の時刻から次の一言を選ぶ（本体から使う口） */
export function partnerLineNow(now: Date, input: Omit<PartnerLineInput, "hour">): PartnerLine {
  return nextPartnerLine({ ...input, hour: partnerHour(now) });
}

/** 誘いの一言（相手が生徒か先生かで言い方を変える） */
export function inviteLine(role: PartnerLineInput["role"]): string {
  return INVITE_LINE[audienceOf(role)];
}

/** すべての一言（テストと点検用） */
export function allPartnerLines(audience: PartnerAudience): string[] {
  const asks = Object.values(ASK_BY_TIME[audience]).flat();
  return [...asks, ...ASK_ANYTIME[audience], GOAL_ASK_SHORT[audience], GOAL_ASK[audience]("目標"), ...ABOUT[audience], ...GUIDE[audience], INVITE_LINE[audience]];
}
