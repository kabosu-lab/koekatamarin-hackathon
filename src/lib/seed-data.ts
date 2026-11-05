// ダミーのデータ。学校も人物も投稿もすべて架空で、実在のものとは関係ない。

export const schoolName = "こえかた学校（架空）";

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
  /** 「○○さんに聞いてみる」の相手 */
  askedPersonId?: string;
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

/** 最初から分身を持っている人。佐伯先生はデモで最初の問いかけから始める。 */
export const seedAvatars: Record<string, string> = {
  ogawara: "elder",
  kawamura: "coat",
  noda: "craft",
  shiraishi: "bird",
  fujimoto: "dragon",
  aoki: "jacket",
  kinoshita: "beast",
  nakamura: "spirit",
};

/** ふりかえりで使う、過去の日報と日記。どれも本人だけのもので、誰にも届いていない。 */
export const pastReports: { personId: string; date: string; items: string[] }[] = [
  {
    personId: "saeki",
    date: "2026-09-18",
    items: ["文化祭のクラスの出し物を、生徒に任せてみた", "パソコンの出席入力でまた止まった。野田先生に聞いた"],
  },
  {
    personId: "saeki",
    date: "2026-10-09",
    items: ["作文に、いいところを一つだけ書くようにした", "川村先生の授業の相談にのった"],
  },
  {
    personId: "aoki",
    date: "2026-09-25",
    items: ["ITパスポートの勉強を始めた。用語が多くて驚いた"],
  },
  {
    personId: "aoki",
    date: "2026-10-16",
    items: ["過去問の点数が初めて半分を超えた", "友だちに勉強会に来ないかと声をかけた"],
  },
];

/** 生徒の日記が届く担任。 */
export const homeroomTeachers: Record<string, string> = {
  aoki: "saeki",
  kinoshita: "ogawara",
  nakamura: "kawamura",
};

/** テストの時期（架空の年間予定）。問いかけをテスト勉強向けに変える。 */
export const examPeriods = [
  { from: "2026-11-24", to: "2026-11-30" },
  { from: "2027-02-15", to: "2027-02-21" },
] as const;

/** 命や安全に関わる知らせが必ず届く人（相談室）。 */
export const counselorId = "shiraishi";
/** ダミーの広報の担当。 */
export const prOfficerId = "fujimoto";

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
  {
    id: "lessons",
    name: "授業づくり",
    description: "授業の工夫や教材を教職員で分け合う",
    audience: "staff",
  },
  {
    id: "school-tips",
    name: "校務の知恵",
    description: "校務の手順やこつを教職員で残す",
    audience: "staff",
  },
];

export const posts: SeedPost[] = [
  {
    id: "post-ask-1",
    channelId: "making",
    authorId: "kinoshita",
    kind: "trouble",
    body: "しおり立ての底を広くしたら、今度は反ってしまいました。佐伯先生、図書室で使うならどのくらいの大きさがいいですか？ 反りの直し方も知りたいです🙏",
    createdAt: "2026-11-02T16:40:00+09:00",
    replies: [],
    likedBy: ["noda"],
    askedPersonId: "saeki",
  },
  {
    id: "post-ask-2",
    channelId: "staffroom",
    authorId: "kawamura",
    kind: "worry",
    body: "作文の感想に、どんな一言を書くと生徒に届くのか悩んでいます。佐伯先生はどうされていますか？",
    createdAt: "2026-11-02T17:20:00+09:00",
    replies: [],
    likedBy: [],
    askedPersonId: "saeki",
  },
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
    body: "今日は過去問を20問解きました✏️ ネットワークの問題だけ、まだ半分しか合いません💦",
    createdAt: "2026-10-27T19:40:00+09:00",
    replies: [
      {
        id: "reply-study-1",
        authorId: "noda",
        body: "半分合うなら順調です👍 ぼくが受けたときも、ネットワークは最後まで苦手でした😅",
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
    body: "図書室のしおり立てを 3D プリンターで試作しました📚✨ 少し倒れやすいので、底を広くします🔧",
    createdAt: "2026-10-28T16:20:00+09:00",
    replies: [
      {
        id: "reply-making-1",
        authorId: "saeki",
        body: "図書室の前で見ました👀 国語の教室にも一つほしいです！",
        createdAt: "2026-10-29T12:15:00+09:00",
      },
    ],
    likedBy: ["noda", "saeki"],
  },
  {
    id: "post-making-2",
    channelId: "making",
    authorId: "kawamura",
    kind: "trouble",
    body: "文化祭のクラス紹介動画🎬 毎年つくるのに時間がかかります。早く作るコツはありますか？",
    createdAt: "2026-10-20T16:10:00+09:00",
    replies: [
      {
        id: "reply-making-2a",
        authorId: "noda",
        body: "撮る前に、30秒の場面を紙に6枚書くと撮り直しが減りました。去年は半分の時間で終わりました🎉",
        createdAt: "2026-10-20T17:05:00+09:00",
      },
      {
        id: "reply-making-2b",
        authorId: "kinoshita",
        body: "音楽は最後に決めると、映像に合わせやすかったです🎵",
        createdAt: "2026-10-21T08:10:00+09:00",
      },
    ],
    likedBy: ["saeki", "aoki"],
  },
  {
    id: "post-study-2",
    channelId: "study",
    authorId: "kawamura",
    kind: "trouble",
    body: "授業の小テストを毎回作るのに時間がかかっています💦 みなさんはどうしていますか？",
    createdAt: "2026-10-22T15:30:00+09:00",
    replies: [
      {
        id: "reply-study-2",
        authorId: "ogawara",
        body: "同じ形の問題を5問に決めて、数字と語句だけ毎回替えています。作るのは10分くらいです⏱️",
        createdAt: "2026-10-22T16:40:00+09:00",
      },
    ],
    likedBy: ["saeki"],
  },
  {
    id: "post-clubs-1",
    channelId: "clubs",
    authorId: "nakamura",
    kind: "effort",
    body: "朝練を今週は全部行けました🎺 高い音がやっと出るようになってきました✨",
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
        body: "紙で大丈夫なときは紙でよいと思います。次の空き時間に一緒に一度やってみましょうか😊",
        createdAt: "2026-10-30T17:10:00+09:00",
      },
    ],
    likedBy: ["kawamura"],
  },
  {
    id: "post-making-3",
    channelId: "making",
    authorId: "kawamura",
    kind: "trouble",
    body: "授業で生徒の手が止まったとき、声をかけるタイミングがつかめません。みなさんはどこを見ていますか？👀",
    createdAt: "2026-10-23T16:00:00+09:00",
    replies: [
      {
        id: "reply-making-3",
        authorId: "ogawara",
        body: "うまく言えないんですが、鉛筆より先に肩を見ます。肩が落ちたら、答えではなく「どこまで書けた？」と聞くと、また動き出します😊",
        createdAt: "2026-10-23T17:10:00+09:00",
      },
    ],
    likedBy: ["saeki", "noda"],
  },
  {
    id: "post-study-3",
    channelId: "study",
    authorId: "kawamura",
    kind: "trouble",
    body: "初めて出張に行きます。書類の出し方を、どなたか教えてもらえませんか？🙏",
    createdAt: "2026-10-24T15:20:00+09:00",
    replies: [
      {
        id: "reply-study-3",
        authorId: "noda",
        body: "1週間前までに申請書を出して、戻ったら3日以内に報告書でした。旅費の領収書は、もらったらすぐ写真に撮っておくと楽です📷",
        createdAt: "2026-10-24T16:05:00+09:00",
      },
    ],
    likedBy: ["saeki"],
  },
];

/** 最初から広がっている校内の知恵。言葉が使われた人は、投稿と返信から決まる。 */
export const seedKnowledge = [
  {
    id: "knowledge-stuck-moment",
    postId: "post-making-3",
    authorId: "kawamura",
    title: "生徒の手が止まったときの声のかけ方",
    body: "鉛筆より先に肩を見る。肩が落ちたら、答えではなく「どこまで書けた？」と聞くと、また動き出す（大河原先生）。",
    reviews: [{ reviewerId: "noda", verdict: "like", comment: "肩を見るようにしたら、声をかける時が分かってきました。" }],
  },
  {
    id: "knowledge-festival-video",
    postId: "post-making-2",
    authorId: "kawamura",
    title: "文化祭の動画を早く作る",
    body: "撮る前に、30秒の場面を紙に6枚書くと撮り直しが減る（野田先生。去年は半分の時間で終わった）。音楽は最後に決めると映像に合わせやすい（木下さん）。",
    reviews: [{ reviewerId: "saeki", verdict: "like", comment: "クラスで試して、撮り直しが減りました。" }],
  },
  {
    id: "knowledge-quick-quiz",
    postId: "post-study-2",
    authorId: "kawamura",
    title: "小テストを10分で作る",
    body: "同じ形の問題を5問に決めて、数字と語句だけ毎回替える（大河原先生。作るのは10分くらい）。",
    reviews: [],
  },
  {
    id: "knowledge-business-trip",
    postId: "post-study-3",
    authorId: "kawamura",
    title: "出張の出し方",
    body: "1週間前までに申請書を出し、戻ったら3日以内に報告書を出す。旅費の領収書は、もらったらすぐ写真に撮っておくと楽（野田先生）。",
    reviews: [],
  },
] as const;

/** 最初から出ている注釈。書いた人以外の2人が「役に立つ」と押してある。 */
export const seedKnowledgeNotes = [
  {
    id: "note-quick-quiz",
    itemId: "knowledge-quick-quiz",
    authorId: "saeki",
    body: "同じ形にしておくと、生徒が前の回の解き方を思い出しやすいのもいいところでした😊",
    voterIds: ["noda", "aoki"],
  },
] as const;
