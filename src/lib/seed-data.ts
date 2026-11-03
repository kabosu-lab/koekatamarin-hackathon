// ダミーのデータ。学校も人物も投稿もすべて架空で、実在のものとは関係ない。

export const schoolName = "こえかた高校（架空）";

export type Role = "teacher" | "admin" | "student";
export type Audience = "everyone" | "staff";
export type PostKind = "notice" | "trouble" | "worry" | "effort" | "report";

export type SeedPerson = {
  id: string;
  name: string;
  role: Role;
  label: string;
  publicProfile: string;
};

export type SeedChannel = {
  id: string;
  name: string;
  description: string;
  audience: Audience;
};

export type SeedReply = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type SeedPost = {
  id: string;
  channelId: string;
  authorId: string;
  kind: PostKind;
  body: string;
  createdAt: string;
  replies: SeedReply[];
  likedBy: string[];
};

export const people: SeedPerson[] = [
  {
    id: "saeki",
    name: "佐伯 みどり",
    role: "teacher",
    label: "国語・2年担任",
    publicProfile: "パソコンやアプリは苦手。授業づくりと生徒の作文の話なら、いくらでもできます。",
  },
  {
    id: "ogawara",
    name: "大河原 誠",
    role: "teacher",
    label: "英語・学年主任",
    publicProfile: "教員歴25年の先輩。保護者対応とクラス運営の相談なら、いつでも声をかけてください。",
  },
  {
    id: "kawamura",
    name: "川村 陽菜",
    role: "teacher",
    label: "理科・1年副担任",
    publicProfile: "教員になって2年目。実験の準備は得意ですが、クラス運営は勉強中です。",
  },
  {
    id: "noda",
    name: "野田 翔",
    role: "teacher",
    label: "情報・ものづくり部顧問",
    publicProfile: "ICT の困りごとと 3D プリンターの担当。小さなことでも聞いてください。",
  },
  {
    id: "shiraishi",
    name: "白石 文",
    role: "teacher",
    label: "養護・相談室",
    publicProfile: "保健室と相談室にいます。生徒のことで気になることがあれば、一緒に考えましょう。",
  },
  {
    id: "fujimoto",
    name: "藤本 恵",
    role: "admin",
    label: "教頭",
    publicProfile: "先生方の日報を読むのが毎日の楽しみです。一言ですが、返します。",
  },
  {
    id: "aoki",
    name: "青木 ひより",
    role: "student",
    label: "2年",
    publicProfile: "資格の勉強会に参加中。ITパスポートの合格を目指しています。",
  },
  {
    id: "kinoshita",
    name: "木下 蓮",
    role: "student",
    label: "3年・ものづくり部",
    publicProfile: "3D プリンターで、学校で使う小物を作っています。",
  },
  {
    id: "nakamura",
    name: "中村 結衣",
    role: "student",
    label: "1年・吹奏楽部",
    publicProfile: "吹奏楽部でクラリネットを吹いています。朝練を続けるのが今の目標です。",
  },
];

export const channels: SeedChannel[] = [
  {
    id: "notices",
    name: "全校のお知らせ",
    description: "学校全体への連絡",
    audience: "everyone",
  },
  {
    id: "study",
    name: "資格の勉強会",
    description: "勉強は教えない。一緒に勉強する",
    audience: "everyone",
  },
  {
    id: "making",
    name: "ものづくり",
    description: "3D プリンターと作ったもの",
    audience: "everyone",
  },
  {
    id: "clubs",
    name: "部活の頑張り",
    description: "練習や大会の様子",
    audience: "everyone",
  },
  {
    id: "staffroom",
    name: "職員室",
    description: "教職員だけのチャネル",
    audience: "staff",
  },
];

export const posts: SeedPost[] = [
  {
    id: "post-notice-1",
    channelId: "notices",
    authorId: "fujimoto",
    kind: "notice",
    body: "来週の金曜日は短縮授業です。下校の時刻に気をつけてください。",
    createdAt: "2026-10-26T08:10:00+09:00",
    replies: [],
    likedBy: [],
  },
  {
    id: "post-notice-2",
    channelId: "notices",
    authorId: "fujimoto",
    kind: "notice",
    body: "避難訓練のアンケートを今週中に提出してください。",
    createdAt: "2026-10-27T08:05:00+09:00",
    replies: [],
    likedBy: ["ogawara"],
  },
  {
    id: "post-study-1",
    channelId: "study",
    authorId: "aoki",
    kind: "effort",
    body: "今日は過去問を20問解きました。ネットワークの問題だけ、まだ半分しか合いません。",
    createdAt: "2026-10-27T19:40:00+09:00",
    replies: [
      {
        id: "reply-study-1",
        authorId: "noda",
        body: "半分合うなら順調です。ぼくが受けたときも、ネットワークは最後まで苦手でした。",
        createdAt: "2026-10-28T07:50:00+09:00",
      },
    ],
    likedBy: ["noda", "nakamura"],
  },
  {
    id: "post-making-1",
    channelId: "making",
    authorId: "kinoshita",
    kind: "report",
    body: "図書室のしおり立てを 3D プリンターで試作しました。少し倒れやすいので、底を広くします。",
    createdAt: "2026-10-28T16:20:00+09:00",
    replies: [
      {
        id: "reply-making-1",
        authorId: "saeki",
        body: "図書室の前で見ました。国語の教室にも一つほしいです。",
        createdAt: "2026-10-29T12:15:00+09:00",
      },
    ],
    likedBy: ["noda", "saeki"],
  },
  {
    id: "post-clubs-1",
    channelId: "clubs",
    authorId: "nakamura",
    kind: "effort",
    body: "朝練を今週は全部行けました。高い音がやっと出るようになってきました。",
    createdAt: "2026-10-30T08:00:00+09:00",
    replies: [],
    likedBy: [],
  },
  {
    id: "post-staff-1",
    channelId: "staffroom",
    authorId: "kawamura",
    kind: "trouble",
    body: "クラスの席替えのことで、保護者の方から連絡がありました。初めてで、どう返すか迷っています。",
    createdAt: "2026-10-29T17:30:00+09:00",
    replies: [
      {
        id: "reply-staff-1",
        authorId: "ogawara",
        body: "私も若いころに同じことで悩みました。まず電話で話を聞くとうまくいきました。明日、少し話しましょう。",
        createdAt: "2026-10-29T18:05:00+09:00",
      },
    ],
    likedBy: ["shiraishi"],
  },
  {
    id: "post-staff-2",
    channelId: "staffroom",
    authorId: "saeki",
    kind: "worry",
    body: "作文の提出をアプリでと言われましたが、やり方が分からなくて、紙で集めてしまいました。",
    createdAt: "2026-10-30T16:45:00+09:00",
    replies: [
      {
        id: "reply-staff-2",
        authorId: "noda",
        body: "紙で大丈夫なときは紙でよいと思います。次の空き時間に一緒に一度やってみましょうか。",
        createdAt: "2026-10-30T17:10:00+09:00",
      },
    ],
    likedBy: ["kawamura"],
  },
];
