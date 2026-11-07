import { describe, expect, it, vi } from "vitest";
import { createAnthropicClaude, MODEL, type MessagesApi } from "./anthropic";
import { TooLongError } from "./compose";
import { converse, splitReady, withSources } from "./converse";
import { createClaude } from "./index";
import { companionSystemPrompt, openingLines, READY_MARK, readyMark, refusalReply, trialCompanionSystemPrompt } from "./persona";
import { createScriptedClaude, isTeacherSpeaking } from "./scripted";

function stubApi(response: { content: unknown[]; stop_reason: string }) {
  const create = vi.fn().mockResolvedValue(response);
  return { api: { create } as unknown as MessagesApi, create };
}

describe("createClaude", () => {
  it("キーがなければ台本で動く", () => {
    expect(createClaude({}).mode).toBe("scripted");
    expect(createClaude({ ANTHROPIC_API_KEY: "" }).mode).toBe("scripted");
  });

  it("キーがあれば本物を使う", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "test-key" }).mode).toBe("real");
  });

  it("試用では、生徒用も先生用も回数の上限つきの本物。台本の指定があれば台本", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x", KOEKATA_TRIAL_AUDIENCE: "student" }).mode).toBe("real");
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x", KOEKATA_TRIAL_AUDIENCE: "teacher" }).mode).toBe("real");
    expect(createClaude({ ANTHROPIC_API_KEY: "k", KOEKATA_ACCESS_CODE: "x", KOEKATA_CLAUDE: "scripted" }).mode).toBe("scripted");
  });

  it("テストの指定があれば、キーがあっても料金を使わない", () => {
    expect(createClaude({ ANTHROPIC_API_KEY: "test-key", KOEKATA_CLAUDE: "scripted" }).mode).toBe("scripted");
  });
});

describe("createAnthropicClaude の流す呼び出し（0-2l）", () => {
  function streamApi(stopReason: string) {
    const events = [
      { type: "content_block_delta", delta: { type: "text_delta", text: '{"text":"あ' } },
      { type: "content_block_delta", delta: { type: "text_delta", text: 'い"}' } },
      { type: "message_delta", delta: { stop_reason: stopReason } },
    ];
    const create = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield* events;
      },
    });
    return { api: { create } as unknown as MessagesApi, create };
  }
  const request = { task: "draft" as const, system: "", messages: [], maxTokens: 10, jsonSchema: {} };

  it("続きを少しずつ渡し、止める合図を SDK に渡す", async () => {
    const { api, create } = streamApi("end_turn");
    const chunks: string[] = [];
    const stop = new AbortController();
    const result = await createAnthropicClaude(api).stream!(request, (chunk) => chunks.push(chunk), stop.signal);
    expect(result).toEqual({ text: '{"text":"あい"}', refused: false });
    expect(chunks).toHaveLength(2);
    expect(create.mock.calls[0][0]).toMatchObject({ stream: true });
    expect(create.mock.calls[0][1]).toEqual({ signal: stop.signal });
  });

  it("上限で止まったら、長すぎたと分けて知らせる", async () => {
    const { api } = streamApi("max_tokens");
    await expect(createAnthropicClaude(api).stream!(request, () => {})).rejects.toBeInstanceOf(TooLongError);
  });
});

describe("createAnthropicClaude", () => {
  it("決めたモデルと設定で呼び、文章だけを返す", async () => {
    const { api, create } = stubApi({
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "こんにちは！" },
      ],
      stop_reason: "end_turn",
    });

    const result = await createAnthropicClaude(api).complete({
      task: "converse",
      system: "指示",
      messages: [{ role: "user", content: "こんにちは" }],
      maxTokens: 100,
    });

    expect(result).toEqual({ text: "こんにちは！", refused: false });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: MODEL,
        max_tokens: 100,
        system: "指示",
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
      }),
    );
  });

  it("安全のために断られたことを伝える", async () => {
    const { api } = stubApi({ content: [], stop_reason: "refusal" });

    const result = await createAnthropicClaude(api).complete({ task: "converse", system: "", messages: [], maxTokens: 100 });

    expect(result).toEqual({ text: "", refused: true });
  });
});

describe("converse", () => {
  it("履歴の後ろに今の発言を足し、パートナーの指示で呼ぶ", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "はい", refused: false });
    const history = [
      { role: "user", content: "こんにちは" },
      { role: "assistant", content: "こんにちは！" },
    ] as const;

    await converse({ mode: "scripted", complete }, [...history], "続きです");

    const request = complete.mock.calls[0][0];
    expect(request.system).toBe(companionSystemPrompt);
    expect(request.messages).toEqual([...history, { role: "user", content: "続きです" }]);
  });

  it("断られたときも、空の返事のときも、黙らず言葉を返す", async () => {
    const refused = await converse(
      { mode: "real", complete: async () => ({ text: "", refused: true }) },
      [],
      "……",
    );
    expect(refused).toEqual({ reply: refusalReply, refused: true, ready: false, level: 0 });

    const empty = await converse(
      { mode: "real", complete: async () => ({ text: "  ", refused: false }) },
      [],
      "……",
    );
    expect(empty).toEqual({ reply: refusalReply, refused: false, ready: false, level: 0 });
  });
});

describe("最初の一言", () => {
  it("決めた3つを必ず試す", () => {
    expect(openingLines).toEqual(["こんにちは", "あんた何ができるん", "私は嫌やわ"]);
  });

  it("台本の「私は嫌やわ」は売り込まない", async () => {
    const { reply } = await converse(createScriptedClaude(), [], "私は嫌やわ");
    expect(reply).toContain("無理に使わんでええ");
  });

  it("パートナーの指示に、人のふりをしない・売り込まない決まりがある", () => {
    expect(companionSystemPrompt).toContain("人のふりをせず");
    expect(companionSystemPrompt).toContain("売り込まない");
    expect(companionSystemPrompt).toContain("連絡した・伝えたと言わない");
    expect(companionSystemPrompt).toContain("要点だけが相談室の先生に届き");
    expect(companionSystemPrompt).toContain("「伝わらない」「大丈夫」と言い切らず");
    // 試用では先生や相談室に届かないので、届くと言わせない。投稿は見えるので、誰にも見られないとも言わせない
    expect(trialCompanionSystemPrompt).toContain("相談室にも先生にも届きません");
    expect(trialCompanionSystemPrompt).toContain("「誰にも伝わらない」「誰にも見られない」と言い切らない");
    expect(trialCompanionSystemPrompt).not.toContain("要点だけが相談室の先生に届き");
    expect(trialCompanionSystemPrompt).toContain("110 番や 119 番");
  });

  it("パートナーの指示に、相手のトーンに合わせる決まりがある", () => {
    expect(companionSystemPrompt).toContain("同じトーンで返す");
    expect(companionSystemPrompt).toContain("敬語に戻さず");
    expect(companionSystemPrompt).toContain("相手が使っていない方言は使わない");
  });
});

describe("先生にはいつもやわらかい丁寧語（0-2c）", () => {
  const TEACHER = "話している人：先生";
  const STUDENT = "話している人：生徒";
  // ため口の言い終わり。先生への台本の返事には出さない
  const CASUAL = /(やで|やん|やった|へん|しよう?|よう|ったね|てん|たん|るん|(?<!ませ)んね|かあ|んや|みて|ある？|そう？|みる？)[。？！]?$|ええ|いつやるん|どこでやるん/;
  const sentences = (text: string) => text.replace(/\[\[[^\]]*\]\]/g, "").split(/(?<=[。？！])/).map((s) => s.trim()).filter(Boolean);

  it("「話している人」の行から先生かどうかを見分ける", () => {
    expect(isTeacherSpeaking(TEACHER)).toBe(true);
    expect(isTeacherSpeaking(`覚えていること\n\n${TEACHER}`)).toBe(true);
    expect(isTeacherSpeaking(STUDENT)).toBe(false);
    expect(isTeacherSpeaking("")).toBe(false);
    expect(isTeacherSpeaking(undefined)).toBe(false);
  });

  it("パートナーの指示に、先生にはです・ます調を崩さない決まりがある", () => {
    expect(companionSystemPrompt).toContain("先生と話すとき");
    expect(companionSystemPrompt).toContain("です・ます調のやわらかい丁寧語");
    expect(companionSystemPrompt).toContain("くだけた言葉やため口に崩さない");
    expect(companionSystemPrompt).toContain("硬すぎない");
    expect(companionSystemPrompt).toContain("まとめの一言も、です・ます調");
    // 生徒には今までどおりトーンを合わせる
    expect(companionSystemPrompt).toContain("トーンを相手に合わせるのは、生徒のときと、その行がないとき");
    expect(trialCompanionSystemPrompt).toContain("先生と話すとき");
  });

  // 台本の会話を、決めた言葉の順に話す
  async function talkThrough(lines: string[], who: string) {
    const scripted = createScriptedClaude();
    const history: { role: "user" | "assistant"; content: string }[] = [];
    const replies: string[] = [];
    for (const line of lines) {
      const { reply } = await converse(scripted, history, line, who);
      history.push({ role: "user", content: line }, { role: "assistant", content: reply });
      replies.push(reply);
    }
    return replies;
  }

  const flows = [
    [...openingLines],
    ["まじしんどいわー", "それな", "ありがと、もういいわ"],
    ["今日の授業、急に静かになった瞬間があって", "声を小さくしたんだ", "そしたらみんな聞いてくれた", "若い先生にも役立ちそう"],
    ["放課後に勉強会を開きたい", "金曜の16時から", "情報室で"],
  ];

  it("先生には、くだけて話されても台本の返事がです・ます調", async () => {
    for (const flow of flows) {
      for (const reply of await talkThrough(flow, TEACHER)) {
        for (const sentence of sentences(reply)) expect(sentence, reply).not.toMatch(CASUAL);
        expect(reply).toMatch(/(です|ます|ません|ください|ましょう|でした|ですか|ますか|でしたか|ね)[。？！]/);
      }
    }
  });

  it("生徒には、今までどおり相手のトーンに合わせる", async () => {
    const [, what, nope] = await talkThrough([...openingLines], STUDENT);
    expect(what).toContain("得意やで");
    expect(nope).toContain("無理に使わんでええ");
    const story = await talkThrough(flows[2], STUDENT);
    expect(story[0]).toContain("その少し前、何してたん");
    expect(story[1]).toContain("コツかもしれんね");
    // 見分けの物差しが、生徒へのため口をちゃんと拾えている
    for (const flow of [flows[0].slice(1), flows[2], flows[3]]) {
      for (const reply of await talkThrough(flow, STUDENT)) expect(sentences(reply).some((s) => CASUAL.test(s)), reply).toBe(true);
    }
  });
});

describe("とどけるを光らせる印", () => {
  it("印を返事から取り除き、あったかどうかを返す", () => {
    expect(splitReady(`いいね、それ届けてみよう。
${READY_MARK}`)).toEqual({ reply: "いいね、それ届けてみよう。", ready: true, level: 1 });
    expect(splitReady("もう少し聞かせて。")).toEqual({ reply: "もう少し聞かせて。", ready: false, level: 0 });
    expect(splitReady(READY_MARK).reply).toBe("");
  });

  it("段つきの印 [[とどけられる:1]]〜[[とどけられる:3]] を読み、前の形は段1として読む", () => {
    expect(splitReady("何があったか、言葉になったね。\n[[とどけられる:1]]")).toEqual({ reply: "何があったか、言葉になったね。", ready: true, level: 1 });
    expect(splitReady("どうしたかも出たね。\n[[とどけられる:2]]")).toEqual({ reply: "どうしたかも出たね。", ready: true, level: 2 });
    expect(splitReady("もう投稿にできそう。\n[[とどけられる:3]]")).toEqual({ reply: "もう投稿にできそう。", ready: true, level: 3 });
    expect(splitReady("全角のコロンでも\n[[とどけられる：2]]").level).toBe(2);
  });

  it("印が2つあれば高いほう、範囲の外の数字は1〜3に収め、どの印も画面に出さない", () => {
    const result = splitReady("[[とどけられる:1]]途中[[とどけられる:3]]");
    expect(result).toEqual({ reply: "途中", ready: true, level: 3 });
    expect(splitReady("あ\n[[とどけられる:9]]").level).toBe(3);
    expect(splitReady("あ\n[[とどけられる:0]]").level).toBe(1);
  });

  it("命や安全に関わる言葉があるときは、印があっても光らせない", async () => {
    const claude = { mode: "real" as const, complete: async () => ({ text: "話してくれてありがとう。\n[[とどけられる:3]]", refused: false }) };
    expect(await converse(claude, [], "もう消えたい")).toMatchObject({ ready: false, level: 0 });
    expect(await converse(claude, [], "今日の授業がうまくいった")).toMatchObject({ ready: true, level: 3 });
  });

  it("台本では、話が進むほど段が1→2→3と上がる", async () => {
    const claude = createScriptedClaude();
    const lines = ["今日の授業、急に静かになった瞬間があって", "声を小さくしたんだ", "そしたらみんな聞いてくれた", "若い先生にも役立ちそう"];
    const history: { role: "user" | "assistant"; content: string }[] = [];
    const levels: number[] = [];
    for (const line of lines) {
      const result = await converse(claude, history, line);
      expect(result.reply).not.toContain("[[");
      levels.push(result.level);
      history.push({ role: "user", content: line }, { role: "assistant", content: result.reply });
    }
    expect(levels).toEqual([0, 1, 2, 3]);
  });

  it("パートナーの指示に段つきの印の決まりがあり、試用の指示にも残る", () => {
    for (const prompt of [companionSystemPrompt, trialCompanionSystemPrompt]) {
      expect(prompt).toContain(readyMark(1));
      expect(prompt).toContain(readyMark(2));
      expect(prompt).toContain(readyMark(3));
      expect(prompt).toContain("前より低い段にはしない");
      expect(prompt).toContain("命や安全に関わる話のときは付けない");
    }
    expect(readyMark(2)).toBe("[[とどけられる:2]]");
  });

  it("印だけの返事は、答えられなかったときの言葉にして、光らせない", async () => {
    const claude = { mode: "real" as const, complete: async () => ({ text: READY_MARK, refused: false }) };
    expect(await converse(claude, [], "こんにちは")).toEqual({ reply: refusalReply, refused: false, ready: false, level: 0 });
  });

  it("台本でも、要素がそろったら光り、そろう前は光らない", async () => {
    const claude = createScriptedClaude();
    expect((await converse(claude, [], "今日の授業、急に静かになった瞬間があって")).ready).toBe(false);
    const history = [{ role: "user" as const, content: "今日の授業、急に静かになった瞬間があって" }, { role: "assistant" as const, content: "へえ" }];
    const result = await converse(claude, history, "声を小さくしたんだ");
    expect(result.ready).toBe(true);
    expect(result.reply).not.toContain(READY_MARK);
  });

  it("台本でも、3D プリンターの看板の話から、詳しい野田先生につなぐ（動画の中心の話）", async () => {
    const claude = createScriptedClaude();
    const first = await converse(claude, [], "3D プリンターで文化祭の看板、作ってみたいんだけど");
    expect(first.ready).toBe(false);
    const history = [{ role: "user" as const, content: "3D プリンターで文化祭の看板、作ってみたいんだけど" }, { role: "assistant" as const, content: first.reply }];
    const next = await converse(claude, history, "でも、どこから始めればいいか分からなくて");
    expect(next.reply).toContain("野田先生が詳しいかも");
    expect(next.reply).toContain("聞いてみる？");
    expect(next.ready).toBe(true);
  });
});

describe("調べものの出典（0-1s）", () => {
  it("出典の印は画面に出さず、「出典：題 URL」の行にする", () => {
    const { reply } = splitReady("標高は3,776メートルやで。\n[[出典:国土地理院|https://www.gsi.go.jp/]]\n\n[[とどけられる:1]]");
    expect(reply).not.toContain("[[");
    expect(reply).toContain("標高は3,776メートルやで。");
    expect(reply).toContain("出典：国土地理院 https://www.gsi.go.jp/");
  });

  it("URL でないものは出典にしない", () => {
    expect(withSources("本文\n[[出典:あやしい|javascript:alert(1)]]")).toBe("本文");
  });
});

describe("台本の日報", () => {
  it("前の日報の項目（項目：の行）を同じ見出しに残し、増えた分を足す", async () => {
    const { text } = await createScriptedClaude().complete({
      task: "daily",
      system: "",
      messages: [
        {
          role: "user",
          content:
            "<前の日報>\n［うまくいったこと］\n項目：朝の会で声を小さくした\n</前の日報>\n\n<パートナーとの話>\n本人：放課後に面談した\n本人：保護者への伝え方に迷っている\n本人：明日は学年会で話す\n</パートナーとの話>",
        },
      ],
      maxTokens: 100,
    });
    // 0-3g：本物と同じ形（一言＋見出し）。一言は最後に話した言葉
    expect(JSON.parse(text)).toEqual({
      words: "明日は学年会で話す",
      good: ["朝の会で声を小さくした", "放課後に面談した"],
      consult: ["保護者への伝え方に迷っている"],
      tomorrow: [],
    });
  });

  it("今日の一言がもう届いていれば、新しい言葉は見出しの方へ入れる", async () => {
    const { text } = await createScriptedClaude().complete({
      task: "daily",
      system: "",
      messages: [
        {
          role: "user",
          content: "<変えない項目>\n［今日の一言］\n直した項目：朝は眠かった\n</変えない項目>\n\n<パートナーとの話>\n本人：明日は早く来る\n</パートナーとの話>",
        },
      ],
      maxTokens: 100,
    });
    expect(JSON.parse(text)).toEqual({ words: "", good: [], consult: [], tomorrow: ["明日は早く来る"] });
  });
});
