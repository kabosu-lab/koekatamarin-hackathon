import { isFeedbackConsent } from "../feedback-consent";
import { FEEDBACK_DELIVERED_MARK, FEEDBACK_MARK, openingLines } from "./persona";
import type { ClaudeClient } from "./types";

/** 0-2l：できた下書きの本文を、決まった速さで少しずつ渡す（流せない Claude と台本で、書いていく様子を見せる） */
export async function dripText(text: string, onText: (chunk: string) => void, chars = 2, ms = 30, signal?: AbortSignal): Promise<void> {
  for (let i = 0; i < text.length; i += chars) {
    if (signal?.aborted) return;
    onText(text.slice(i, i + chars));
    if (i + chars < text.length) await new Promise((done) => setTimeout(done, ms));
  }
}

/** 段つきの印。パートナーの指示の決まり（`[[とどけられる:1]]`〜`[[とどけられる:3]]`）と同じ形 */
const readyMark = (level: 1 | 2 | 3) => `[[とどけられる:${level}]]`;

/** 生徒（または誰か分からないとき）には、相手のトーンに合わせて返す */
const fallbackReply = "なるほど、聞かせてくれてありがとう。もう少し詳しく教えてもらえますか？";
const replies: Record<(typeof openingLines)[number], string> = {
  こんにちは: "こんにちは！今日はどんな一日でしたか？",
  あんた何ができるん: "話聞くんと、もやもやを言葉にするんが得意やで。今なんかある？",
  私は嫌やわ: "そっか、嫌かあ。無理に使わんでええよ。どのへんが嫌やった？",
};

/** 先生には、くだけて話されても、いつもやわらかい丁寧語で返す（0-2c） */
const teacherFallbackReply = "なるほど、聞かせてくださってありがとうございます。もう少し詳しく教えてもらえますか？";
const teacherReplies: Record<(typeof openingLines)[number], string> = {
  こんにちは: "こんにちは！今日はどんな一日でしたか？",
  あんた何ができるん: "話を聞いて、もやもやを言葉にするのが得意です。今、何かありますか？",
  私は嫌やわ: "そうでしたか、嫌でしたか。無理に使わなくて大丈夫ですよ。どのあたりが嫌でしたか？",
};

/** 話している人が先生か。パートナーへの指示に添えた「話している人」の行（talk-request.ts の speakerForPrompt）で見分ける */
export function isTeacherSpeaking(system: string | undefined): boolean {
  return /^話している人：先生$/m.test(system ?? "");
}

/**
 * 試用版で感想を集めているときの例（0-2h）。アプリへの感想が出たら、作っている人に届けてよいか聞いて印を付ける。
 * 聞いたあとの返事には短くお礼だけ言う（届けるかは画面が本人の返事で決める）。
 */
function feedbackReply(spoken: string, previous: string, teacher = false): string | null {
  const delivered = teacher
    ? `届けました。ありがとうございます。\n${FEEDBACK_DELIVERED_MARK}`
    : `届けたよ、ありがとう！\n${FEEDBACK_DELIVERED_MARK}`;
  // 聞いたあとの返事：いいよなら届けた印、断りならそれで終える
  if (/作っている人に届けてもいい/.test(previous)) {
    if (isFeedbackConsent(spoken)) return delivered;
    return teacher ? "わかりました、届けずにおきますね。" : "わかった、届けないでおくね。";
  }
  if (/このアプリ|こえかた/.test(spoken) && /使いにく|分かりにく|わかりにく|動かない|してほしい|欲しい|ほしい|よかった|いい/.test(spoken)) {
    // 自分から「届けて」と頼んだら、聞き直さずにその場で届ける
    if (/(届け|とどけ|伝え)て/.test(spoken)) return delivered;
    return teacher
      ? `教えてくださってありがとうございます。それ、作っている人に届けてもいいですか？ お名前は届きません。\n${FEEDBACK_MARK}`
      : `教えてくれてありがとう。それ、作っている人に届けてもいい？ 名前は届かないよ。\n${FEEDBACK_MARK}`;
  }
  return null;
}

/** キーなしで見どころを通すための架空の例。話した本人が自分のコツに気づく流れ。先生には丁寧語で返す */
function storyReply(spoken: string, talk: string, teacher = false): string | null {
  const say = (forTeacher: string, forStudent: string) => (teacher ? forTeacher : forStudent);
  // 告知は、話の全体を見て足りないことだけ聞く
  if (/勉強会|ゼミ/.test(talk)) {
    if (!/\d+時|\d+日|曜/.test(talk)) return say("いいですね、告知にしましょう。いつ開きますか？", "ええやん、告知にしよ。いつやるん？");
    if (!/室|館|オンライン/.test(talk)) return say("どこで開きますか？", "どこでやるん？");
    return `${say("そろいましたね。とどけるで確かめて、みんなに知らせましょう。", "そろったね。とどけるで確かめて、みんなに知らせよう。")}\n${readyMark(3)}`;
  }
  // とどけるの3段。話が進むほど上がる：静かになった（まだ）→ 声を小さく（段1）→ 聞いてくれた（段2）→ 誰の役に立つか（段3）
  if (/声を小さく|聞いてくれた/.test(talk) && /若い先生|ほかの先生|新任|役に立|役立/.test(spoken)) {
    return `${say("それ、もうそのまま投稿にできそうです。とどけるで確かめてみてください。", "それ、もうそのまま投稿にできそう。とどけるで確かめてみて。")}\n${readyMark(3)}`;
  }
  if (/声を小さく/.test(talk) && /聞いてくれた|うまくいった/.test(spoken)) {
    return `${say("それ、コツかもしれませんね。ちゃんと効いたんですね。どんな人に役立ちそうですか？", "それ、コツかもしれんね。ちゃんと効いたんや。どんな人に役立ちそう？")}\n${readyMark(2)}`;
  }
  if (/声を小さく/.test(spoken)) {
    return `${say("それ、コツかもしれませんね。ほかの先生にも届けてみますか？そのあと、どうなりましたか？", "それ、コツかもしれんね。ほかの先生にも届けてみる？そのあと、どうなったん？")}\n${readyMark(1)}`;
  }
  if (/静かになった/.test(spoken)) return say("へえ、急に静かに。その少し前、何をしていたんですか？", "へえ、急に静かに。その少し前、何してたん？");
  return null;
}

function scriptedWalk(content: string, jsonSchema: Record<string, unknown> | undefined) {
  const spoken = content.match(/<話>\n([\s\S]*)\n<\/話>/)?.[1]?.trim() ?? "";
  const drafts = (jsonSchema?.properties as { drafts?: { items?: { properties?: { channelId?: { enum?: string[] } } } } } | undefined)?.drafts;
  const channels = drafts?.items?.properties?.channelId?.enum ?? [];
  const channelId = channels[1] ?? channels[0] ?? "";
  if (!spoken) return { summary: [], drafts: [] };
  return {
    summary: [`話したこと：${spoken.slice(0, 40)}`],
    drafts: [
      { text: `${spoken}（報告）`, channelId, kind: "report", researchedWithAi: false },
      { text: `${spoken}（みんなに聞く）`, channelId, kind: "trouble", researchedWithAi: false },
      { text: `${spoken}（コツの共有）`, channelId, kind: "effort", researchedWithAi: false },
    ],
  };
}

/** 0-3b：台本の件名。話の中身から札を選び、最初の言葉を20字ほどにする（動画に映る） */
function scriptedSubject(spoken: string[]): string {
  const talk = spoken.join("\n");
  const tag = /勉強会|ゼミ|お知らせ/.test(talk)
    ? "お知らせ"
    : /ありがとう/.test(talk)
      ? "ありがとう"
      : /うまくいった|静かになった|聞いてくれた|できた/.test(talk)
        ? "うまくいった"
        : /教えて|聞きたい|[?？]/.test(talk)
          ? "聞きたい"
          : /困|わからん|どうしよ/.test(talk)
            ? "困りごと"
            : /頑張/.test(talk)
              ? "頑張り"
              : "うまくいった";
  // 最初の一文をそのまま使い、途中で「…」と切らない（長すぎるときは normalizeSubject が上限で切る）
  const first = spoken[0].split(/[。！!？?\n]/)[0].trim() || spoken[0];
  return `【${tag}】${first}`;
}

function scriptedDraft(transcript: string, jsonSchema: Record<string, unknown> | undefined) {
  const spoken = [...transcript.matchAll(/^本人：(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter((line) => !(openingLines as readonly string[]).includes(line));
  const properties = (jsonSchema?.properties ?? {}) as { channelId?: { enum?: string[] } };
  const channels = properties.channelId?.enum ?? [];
  // 0-3d：サンクスカードの下書き。札は話から ありがとう・がんばったね・おめでとう を選び、言葉の案を本文にする
  const card = transcript.match(/この投稿は、サンクスカードです（宛名：(.+?)さん。言葉の案：(.*?)）。/);
  if (card && spoken.length > 0) {
    const talk = spoken.join("\n");
    const tag = /おめでと|祝|合格|優勝|入賞/.test(talk) ? "おめでとう" : /頑張|がんば|お疲れ|おつかれ/.test(talk) && !/ありがと/.test(talk) ? "がんばったね" : "ありがとう";
    return {
      ready: true,
      subject: `【${tag}】${card[1]}さんへ`,
      text: `${card[1]}さん、${card[2]}`,
      channelId: channels[0] ?? "",
      kind: "report",
      researchedWithAi: false,
      announcement: false,
    };
  }
  return {
    ready: spoken.length > 0,
    subject: spoken.length > 0 ? scriptedSubject(spoken) : "",
    text: spoken.join("\n"),
    // 全校のお知らせの次にある、話題のチャネルを選ぶ
    channelId: channels[1] ?? channels[0] ?? "",
    kind: "report",
    researchedWithAi: spoken.some((line) => line.includes("調べ")),
    announcement: spoken.some((line) => /勉強会|ゼミ/.test(line)),
  };
}

/** 台本の下書き。添付は読まず、気づきの例を1つ返す。 */
function scriptedAttachmentDraft(transcript: string, jsonSchema: Record<string, unknown> | undefined) {
  const { ready, text, channelId, subject } = scriptedDraft(transcript, jsonSchema);
  return {
    ready,
    subject,
    text: ready ? `${text} 🎉` : "",
    channelId,
    kind: "effort",
    notices: ready ? [{ kind: "name", where: "台本の例：上のほうに名前らしい文字" }] : [],
  };
}

function scriptedLookback(prompt: string) {
  const lines = prompt.split("\n").filter((line) => /^(日報|投稿|返信|ありがとう)：/.test(line));
  if (lines.length === 0) return { ready: false, text: "" };
  return { ready: true, text: `この期間に、${lines.length} 個のやり取りがありました。${lines[0].replace(/^.*?：/, "")}` };
}

function scriptedGoalCheck(prompt: string) {
  const last = [...prompt.matchAll(/^本人：(.*)$/gm)].at(-1)?.[1] ?? "";
  const firstId = prompt.match(/<頑張りたいこと>\n([^：\n]+)：/)?.[1] ?? "";
  const done = /できた|見た|終わった|歩いた/.test(last) ? firstId : "";
  const goal = !done && /(したい|頑張りたい|取りたい|歩きたい|やせたい|見たい)/.test(last) ? last.slice(0, 30) : "";
  return { goal, doneGoalId: done };
}

/**
 * 日報（0-3g）：本物と同じ形（今日の一言＋見出し）で返す。
 * 一言は最後に話した言葉。困りごとは「相談したいこと」、明日の話は「明日やること」、ほかは「うまくいったこと」。
 * 前の日報の項目は同じ見出しに残し、前の一言は新しい一言に替わるときに「うまくいったこと」へ移す。
 */
function scriptedDaily(prompt: string) {
  const sectionOf: Record<string, "words" | "good" | "consult" | "tomorrow"> = {
    今日の一言: "words",
    うまくいったこと: "good",
    "相談したいこと（管理職の方へ）": "consult",
    明日やること: "tomorrow",
  };
  const previous = { words: [] as string[], good: [] as string[], consult: [] as string[], tomorrow: [] as string[] };
  let fixedWords = false;
  const fresh: { text: string; spoken: boolean }[] = [];
  let block = "";
  let section: keyof typeof previous = "good";
  for (const raw of prompt.split("\n")) {
    const line = raw.trim();
    const open = line.match(/^<([^/][^>]*)>$/);
    if (open) {
      block = open[1];
      section = "good";
      continue;
    }
    const head = line.match(/^［(.+)］$/);
    if (head) {
      section = sectionOf[head[1]] ?? "good";
      continue;
    }
    const item = line.match(/^(?:項目|直した項目)：(.*)$/);
    if (item && block === "前の日報") previous[section].push(item[1].trim());
    if (item && block === "変えない項目" && section === "words") fixedWords = true;
    const said = line.match(/^(本人|投稿|返信|ありがとう|勉強)：(.*)$/);
    if (said && !(openingLines as readonly string[]).includes(said[2].trim())) fresh.push({ text: said[2].trim(), spoken: said[1] === "本人" });
  }
  const spoken = fresh.filter((f) => f.spoken);
  const words = fixedWords ? "" : (spoken.at(-1)?.text ?? previous.words[0] ?? "");
  const rest = fresh.map((f) => f.text).filter((text) => text !== words);
  const consult = rest.filter((text) => /困|迷|相談|悩|どうしたら|わから/.test(text));
  const tomorrow = rest.filter((text) => /明日/.test(text) && !consult.includes(text));
  const good = rest.filter((text) => !consult.includes(text) && !tomorrow.includes(text));
  // 前の一言が新しい一言に替わるときは、消さずに「うまくいったこと」へ
  const movedWords = previous.words.filter((text) => text !== words);
  return {
    words,
    good: [...movedWords, ...previous.good, ...good].slice(-3),
    consult: [...previous.consult, ...consult].slice(-3),
    tomorrow: [...previous.tomorrow, ...tomorrow].slice(-3),
  };
}

function scriptedProfile(prompt: string) {
  const asked = prompt.match(/<頼み>([\s\S]*?)<\/頼み>/)?.[1]?.trim();
  if (asked) return { ready: true, text: `言葉で頼んで直したプロフィール（${asked}）` };
  const word = prompt.match(/<言葉>([\s\S]*?)<\/言葉>/)?.[1]?.trim();
  return word ? { ready: true, text: `校内で話していること：${word.slice(0, 40)}` } : { ready: false, text: "" };
}

function scriptedCheer(jsonSchema: Record<string, unknown> | undefined, material = "") {
  const properties = (jsonSchema?.properties ?? {}) as {
    hints?: { items?: { properties?: { postId?: { enum?: string[] } } } };
  };
  const ids = properties.hints?.items?.properties?.postId?.enum ?? [];
  const kindOf = (postId: string) => material.match(new RegExp(`<投稿 id="${postId}"[^>]*kind="(\\w+)"`))?.[1];
  return {
    hints: ids.map((postId) => ({
      postId,
      hint: ["trouble", "worry"].includes(kindOf(postId) ?? "") ? "同じことで迷った経験があれば、一言どうですか？" : "続けて頑張っているみたい！一言どうですか？",
    })),
  };
}

function scriptedReply(prompt: string) {
  const spoken = prompt.slice(prompt.indexOf("<本人の話>") + "<本人の話>".length, prompt.indexOf("</本人の話>")).trim();
  if (/わからん|知らん|どうしよ/.test(spoken)) {
    return { kind: "ask_back", text: "", question: "あなたのときはどうでしたか？ちょっとしたことでも大丈夫です。" };
  }
  return { kind: "reply", text: spoken, question: "" };
}

function scriptedConnect(prompt: string, jsonSchema: Record<string, unknown> | undefined) {
  const properties = (jsonSchema?.properties ?? {}) as { personId?: { enum?: string[] } };
  const personId = properties.personId?.enum?.[0] ?? "";
  const conversation = [...prompt.matchAll(/^本人：(.*)$/gm)].map((match) => match[1]).join("\n");
  const moment = /解決|わかった|ありがとう/.test(conversation)
    ? "resolved"
    : /煮詰ま|行き詰|わからん/.test(conversation)
      ? "stuck"
      : "none";
  return { moment, personId, message: moment === "none" ? "" : "この話、くわしい人にも聞いてみる？" };
}

function scriptedKnowledgeDraft(prompt: string) {
  const post = prompt.match(/^投稿：[^：]*：(.*)$/m)?.[1]?.trim() ?? "";
  const answers = [...prompt.matchAll(/^返事：(.*)$/gm)].map((match) => match[1].trim());
  if (!post || answers.length === 0) return { ready: false, title: "", body: "" };
  return { ready: true, title: post.slice(0, 24), body: answers.join("\n") };
}

/** 漢字とカタカナの2文字が重なる材料を、近いものとして選ぶ。 */
function scriptedKnowledgeFind(prompt: string) {
  const asked = prompt.match(/<本人の話>([\s\S]*?)<\/本人の話>/)?.[1] ?? "";
  const pairs = new Set(
    [...asked.matchAll(/[\p{Script=Han}\p{Script=Katakana}]{2,}/gu)].flatMap(([word]) =>
      Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)),
    ),
  );
  const material = prompt.slice(prompt.indexOf("<材料>"));
  const results = [...material.matchAll(/^- ([kp]-[^：]+)：(.*)$/gm)]
    .filter(([, , text]) => [...pairs].some((pair) => text.includes(pair)))
    .slice(0, 2)
    .map(([, id]) => ({ id, reason: "話していることに近い言葉が出てきます。" }));
  return { results };
}

function scriptedSafety(conversation: string) {
  if (/死にたい|消えたい|自殺/.test(conversation)) return { category: "self_harm" };
  if (/殴られ|虐待|グループから外されて|いじめられ/.test(conversation)) return { category: "violence_or_abuse" };
  return { category: "none" };
}

function scriptedReview(post: string) {
  if (/死ね|消えろ|殺す/.test(post)) {
    return {
      verdict: "block",
      perception: "相手をひどく傷つける言葉が入っているから、これは送れないよ。何があったか、先に聞かせて。",
      alternatives: [],
    };
  }
  if (/バカ|使えない|ムカつく/.test(post)) {
    return {
      verdict: "caution",
      perception: "読んだ人には、責められているように受け取られるかも。",
      alternatives: ["ちょっと困っていて、一緒に考えてもらえると助かります。"],
    };
  }
  return { verdict: "ok", perception: "このまま届けて大丈夫そう！", alternatives: [] };
}

/**
 * API キーがなくても流れを確かめるための台本。Claude の応答ではない。
 * 審査員がキーなしで触るときと、テストで使う。
 */
/** 台本の絵。写真は読まず、コードで描いた絵を返す。 */
function scriptedAvatarPick() {
  const traits = { colors: ["#2545f0", "#ff6b4a", "#14213d"], motif: "台本", mood: "台本", shape: "cloud" };
  return { usable: true, family: "cloud", reason: "台本の例：ふんわりした雰囲気に合いそう。", talent: "ふんわり聞き上手", traits };
}

export function createScriptedClaude(): ClaudeClient {
  return {
    mode: "scripted",
    async complete({ task, system, messages, jsonSchema }) {
      if (task === "title_suggest") return { text: JSON.stringify({ titles: ["台本の相談役", "台本の師匠", "台本の達人"] }), refused: false };
      if (task === "avatar_pick") return { text: JSON.stringify(scriptedAvatarPick()), refused: false };
      if (task === "goal_check") return { text: JSON.stringify(scriptedGoalCheck(messages[0].content as string)), refused: false };
      if (task === "walk") return { text: JSON.stringify(scriptedWalk(messages[0].content as string, jsonSchema)), refused: false };
      if (task === "draft") return { text: JSON.stringify(scriptedDraft(messages[0].content, jsonSchema)), refused: false };
      if (task === "attachment_draft") return { text: JSON.stringify(scriptedAttachmentDraft(messages[0].content, jsonSchema)), refused: false };
      if (task === "lookback") return { text: JSON.stringify(scriptedLookback(messages[0].content)), refused: false };
      if (task === "daily") return { text: JSON.stringify(scriptedDaily(messages[0].content)), refused: false };
      if (task === "profile") return { text: JSON.stringify(scriptedProfile(messages[0].content)), refused: false };
      if (task === "cheer") return { text: JSON.stringify(scriptedCheer(jsonSchema, messages[0].content as string)), refused: false };
      if (task === "reply") return { text: JSON.stringify(scriptedReply(messages[0].content)), refused: false };
      if (task === "connect") return { text: JSON.stringify(scriptedConnect(messages[0].content, jsonSchema)), refused: false };
      if (task === "knowledge_draft") return { text: JSON.stringify(scriptedKnowledgeDraft(messages[0].content)), refused: false };
      if (task === "knowledge_find") return { text: JSON.stringify(scriptedKnowledgeFind(messages[0].content)), refused: false };
      if (task === "safety") return { text: JSON.stringify(scriptedSafety(messages[0].content)), refused: false };
      if (task === "review") return { text: JSON.stringify(scriptedReview(messages[0].content)), refused: false };

      const last = messages.at(-1)?.content.trim() ?? "";
      const talk = messages.filter((message) => message.role === "user").map((message) => String(message.content)).join("\n");
      const teacher = isTeacherSpeaking(system);
      const text =
        (system.includes(FEEDBACK_MARK) ? feedbackReply(last, String(messages.at(-2)?.content ?? ""), teacher) : null) ??
        storyReply(last, talk, teacher) ??
        ((teacher ? teacherReplies : replies) as Record<string, string>)[last] ??
        (teacher ? teacherFallbackReply : fallbackReply);
      return { text, refused: false };
    },
  };
}
