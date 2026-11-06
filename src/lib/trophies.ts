/**
 * トロフィーの一覧。獲得の判定は trophy-rules.ts にある。
 * 隠しトロフィーの条件が画面の部品に渡らないよう、このファイルは画面の部品から型以外を読み込まない。
 */
export type TrophyCategory = "help" | "connect" | "words" | "failure" | "together" | "effort" | "humor" | "hidden" | "event";

export type TrophyEmblem =
  | "speech"
  | "heart"
  | "bulb"
  | "arrow"
  | "pen"
  | "star"
  | "seed"
  | "clock"
  | "people"
  | "flag"
  | "book"
  | "wrench"
  | "flower"
  | "question";

export type TrophyDefinition = {
  id: string;
  name: string;
  description: string;
  category: TrophyCategory;
  emblem: TrophyEmblem;
  /** 添える一言 */
  quip?: string;
  /** 取るまで名前も条件も見せない */
  hidden?: boolean;
  /** 本人だけに見せ、プロフィールには出さない（回数を条件にするもの、言い換えと取り消しに関わるもの） */
  selfOnly?: boolean;
};

export const CATEGORY_LABELS: Record<TrophyCategory, string> = {
  help: "人を助ける",
  connect: "つなぐ",
  words: "言葉が残る",
  failure: "失敗を価値にする",
  together: "みんなで取る",
  effort: "頑張りをたたえる",
  humor: "学校のあるある",
  hidden: "隠しトロフィー",
  event: "期間限定",
};

/** 並びは定義の順だけ。人と比べる順位や数は作らない。ID はリボンのものを引き継ぐ。 */
export const TROPHIES: readonly TrophyDefinition[] = [
  { id: "first-answer", name: "最初の一歩", description: "誰かの相談に、初めて答えた", category: "help", emblem: "speech" },
  { id: "first-responder", name: "救世主", description: "相談に、いちばん最初に答えた", category: "help", emblem: "star" },
  { id: "repay", name: "恩返し", description: "助けてくれた人を、今度は自分が助けた", category: "help", emblem: "heart" },
  { id: "trusted", name: "頼れる背中", description: "同じ人から2回目の「お願いします」が届いた", category: "help", emblem: "people", selfOnly: true },
  { id: "thanks", name: "ありがとうの人", description: "ありがとうをもらった", category: "help", emblem: "heart" },

  { id: "pass", name: "キラーパス", description: "パスした相談に、答えが届いた", category: "connect", emblem: "arrow" },
  { id: "assist", name: "名アシスト", description: "パスした先の人に、ありがとうが届いた", category: "connect", emblem: "arrow" },
  { id: "bridge", name: "橋をかける人", description: "別の学年や別の部活の人の投稿に、返事をした", category: "connect", emblem: "people" },
  { id: "relay", name: "リレーの走者", description: "3人以上をまたいで、相談が解決した", category: "connect", emblem: "flag" },

  { id: "seed-words", name: "言葉の種", description: "自分の言葉が、初めて校内の知恵になった", category: "words", emblem: "seed" },
  { id: "knowledge-helped", name: "知恵の贈り主", description: "自分の言葉が入った知恵に、いいねが届いた", category: "words", emblem: "bulb" },
  { id: "legend", name: "伝説の一言", description: "自分の言葉が入った知恵に、別の3人からいいねが届いた", category: "words", emblem: "star", selfOnly: true },
  { id: "timeless", name: "時を超える言葉", description: "半年以上前の知恵に、新しいいいねが届いた", category: "words", emblem: "clock" },
  { id: "note-helped", name: "名脇役", description: "書いた注釈が「役に立つ」と言われ、知恵の下に載った", category: "words", emblem: "pen" },

  { id: "nice-fail", name: "ナイス失敗", description: "「うまくいかなかった」経験が、知恵になった", category: "failure", emblem: "bulb" },
  { id: "humble-master", name: "素直な達人", description: "「うまくいかなかった」の意見を受けて、自分の知恵を直した", category: "failure", emblem: "pen" },
  { id: "ask-courage", name: "頼る勇気", description: "誰かに「お願いします」を送り、返事が来た", category: "failure", emblem: "speech" },

  { id: "three-heads", name: "三人寄れば", description: "1つの相談に、3人が返事をした", category: "together", emblem: "people" },
  { id: "full-bloom", name: "満開の立役者", description: "桜が満開になった年に、葉を増やす行動をしていた", category: "together", emblem: "flower" },
  { id: "same-desk", name: "同じ机の仲間", description: "自習室で、同じ時間に誰かと勉強を終えた", category: "together", emblem: "book" },

  { id: "walk-the-talk", name: "有言実行", description: "頑張りたいことを乗り越えて、投稿した", category: "effort", emblem: "flag" },
  { id: "no-running", name: "逃げなかった人", description: "止まっていた頑張りたいことに、もう一度取り組んだ", category: "effort", emblem: "flag" },
  { id: "returned", name: "帰ってきた人", description: "しばらく間が空いたあと、また誰かに返事をした", category: "effort", emblem: "speech" },

  { id: "walking-archive", name: "職員室の生き字引", description: "手順の知恵に、いいねが3つ届いた", category: "humor", emblem: "book", quip: "それ、どこにも書いてないやつ", selfOnly: true },
  { id: "copier-master", name: "コピー機の主", description: "機械や設備の困りごとに答えた", category: "humor", emblem: "wrench", quip: "紙詰まりは友だち" },
  { id: "report-alchemist", name: "出張報告の錬金術師", description: "添付の報告書から投稿を作って送った", category: "humor", emblem: "pen", quip: "3枚が3行に" },
  { id: "faster-than-meeting", name: "会議より早い", description: "相談に、その日のうちに答えが届いた", category: "humor", emblem: "clock", quip: "議題にする前に解決" },
  { id: "chalkboard-legend", name: "伝説の黒板消し", description: "掃除や片付けの工夫が、知恵になった", category: "humor", emblem: "star", quip: "誰も知らないのに、みんな助かっている" },
  { id: "thanks-millionaire", name: "ありがとう長者", description: "ありがとうを10人からもらった", category: "humor", emblem: "heart", quip: "納税の必要はありません", selfOnly: true },
  { id: "walking-search", name: "歩く検索エンジン", description: "3つの違う分野で答えた", category: "humor", emblem: "question", quip: "ただし人間です", selfOnly: true },
  { id: "pass-wizard", name: "パスの魔術師", description: "パスした相談が、3回解決した", category: "humor", emblem: "arrow", quip: "自分では何も答えていない", selfOnly: true },
  { id: "unsung-hero", name: "名もなき英雄", description: "注釈が3回「役に立つ」と言われた", category: "humor", emblem: "pen", quip: "名前は載っています", selfOnly: true },
  { id: "first-post", name: "パートナーのほうが緊張した", description: "初めて投稿した", category: "humor", emblem: "speech", quip: "送ったのは、あなたです" },
  { id: "good-listener", name: "聞き上手のパートナー", description: "問い返しのあとに話して、投稿まで進んだ", category: "humor", emblem: "question", quip: "パートナー、ちょっと得意げ" },
  { id: "walk-talk", name: "歩く独り言", description: "「歩きながら話す」から、初めて投稿した", category: "humor", emblem: "flag", quip: "周りの人には電話のふりで" },
  { id: "ai-vs-human", name: "AI より人", description: "パートナーに「聞いてみる？」と言われて、本当に人に聞いた", category: "humor", emblem: "people", quip: "パートナー、少しさみしそう" },

  { id: "boomerang", name: "ブーメラン", description: "自分が昔投稿した知恵に、未来の自分が助けられた", category: "hidden", emblem: "arrow", hidden: true },
  { id: "mentor", name: "師弟", description: "自分が助けた人が、別の人を助けた", category: "hidden", emblem: "people", hidden: true },
  { id: "same-worry", name: "同じ悩み", description: "同じことで困っていた2人を、パスでつないだ", category: "hidden", emblem: "arrow", hidden: true },
  { id: "both-ways", name: "先生も生徒", description: "生徒の知恵に先生が、先生の知恵に生徒が、いいねをした", category: "hidden", emblem: "heart", hidden: true },
  { id: "four-seasons", name: "四季の人", description: "春夏秋冬それぞれで、誰かの役に立った", category: "hidden", emblem: "flower", hidden: true },
  { id: "undo-art", name: "取り消しの美学", description: "送ったものを取り消して、直して送り直した", category: "hidden", emblem: "pen", quip: "それも立派な推敲", hidden: true, selfOnly: true },
  { id: "rephrase-hero", name: "言い直しの勇者", description: "言い換えの提案を受け入れて送った", category: "hidden", emblem: "speech", quip: "角が取れました", hidden: true, selfOnly: true },
  { id: "under-sakura", name: "桜の木の下で", description: "開花の日に投稿した", category: "hidden", emblem: "flower", quip: "特に何も起きません", hidden: true },
  { id: "one-more-lap", name: "一周まわって", description: "自分が昔答えた内容を、自分で探して読んだ", category: "hidden", emblem: "book", quip: "誰の言葉か、見覚えがありますね", hidden: true },

  // 立場で解ける隠しトロフィー。個人の名前ではなく、肩書きと役割で決める（どの学校でも使え、特定の先生に頼みが集まらない）
  { id: "nurse-word", name: "保健室からの一言", description: "保健室の先生から、返事が届いた", category: "hidden", emblem: "heart", hidden: true },
  { id: "grade-head-eyes", name: "学年主任のまなざし", description: "学年主任の先生から、いいねが届いた", category: "hidden", emblem: "star", hidden: true },
  { id: "homeroom-reply", name: "担任からの返事", description: "担任の先生から、返事が届いた", category: "hidden", emblem: "speech", hidden: true },
  { id: "principal-office", name: "校長室に届いた", description: "管理職の先生から、返事かいいねが届いた", category: "hidden", emblem: "flag", hidden: true },
  { id: "guidance-cheer", name: "生徒指導からのエール", description: "生徒指導の先生から、返事かいいねが届いた", category: "hidden", emblem: "arrow", hidden: true },
  // 誰が・なぜ珍しいかは出さない（めったに使わない人だと分かる見せ方をしない）
  { id: "rare-word", name: "めずらしい一言", description: "めずらしい一言が届いた", category: "hidden", emblem: "flower", hidden: true, selfOnly: true },
];

/** 知恵の種類。本文を読まずに判定できるよう、作る人が選ぶ。 */
export const KNOWLEDGE_TOPICS = ["general", "procedure", "failure", "tidy"] as const;
export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number];

/** 機械や設備の話をするチャネル。提出版のダミーの学校の値で、実際の学校では学校が決める。 */
export const EQUIPMENT_CHANNELS: readonly string[] = ["making"];

/** 開花の日（日本時間の月-日）。提出版はダミー。 */
export const BLOOM_DAY = "04-01";
