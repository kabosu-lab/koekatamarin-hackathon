/** 会話の1発言。送るのは文章だけで、思考の中身などは残さない。 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeTask = "converse" | "draft" | "review" | "safety" | "connect" | "reply" | "cheer" | "profile" | "daily" | "lookback" | "knowledge_draft" | "knowledge_find" | "attachment_draft" | "avatar_art";

/** 下書きの材料として Claude に渡す添付。1回の呼び出しに1つだけ。 */
export type ClaudeAttachment = {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  base64: string;
};

export type ClaudeRequest = {
  /** 何のための呼び出しか。キーなしの台本が返し方を選ぶのに使う。 */
  task: ClaudeTask;
  system: string;
  messages: ChatMessage[];
  /** 最後の発言に付けて渡す */
  attachment?: ClaudeAttachment;
  maxTokens: number;
  /** 指定すると、この形の JSON で返させる */
  jsonSchema?: Record<string, unknown>;
};

export type ClaudeResponse = {
  text: string;
  /** Claude が安全のために答えなかったとき true */
  refused: boolean;
};

/** Claude の呼び出しの差し替え口。本物・キーなしの台本・テスト用を同じ形で扱う。 */
export type ClaudeClient = {
  mode: "real" | "scripted";
  complete(request: ClaudeRequest): Promise<ClaudeResponse>;
};
