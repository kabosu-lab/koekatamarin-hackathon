import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getAccessToken, getAccessTokenResult, type GraphConfig, readGraphConfig, readLinkedPeople } from "../graph/auth";
import { isTrialMode, trialTeamsSender } from "../trial";
import type { CreatePostOptions, PostDestination } from "./types";

/**
 * 本物の Teams とのつなぎ。こえかたの DB を正として、画面はこれまでどおり同期で動く。
 * 送る：本人のトークンがある人の、全員向けで確認の印がない投稿と返信だけ。送れなくてもアプリの送信は失敗にしない。
 * 送り先：data/teams.json の channels（アプリのチャネル → Teams のチームとチャネル）。ないときは、全員が読めるチャネルを team/channel の1か所へ。
 * 読む：Teams の投稿と返信を DB へ取り込む。対応表があれば元のチャネルへ。届いた返事の知らせはそのまま働く。
 * KOEKATA_TEAMS=off、試用版、設定がないときは通信しない。webhook にすると Workflow で送る（予備。読めない）。
 */
const GRAPH = "https://graph.microsoft.com/v1.0";
const DEFAULT_SYNC_MS = 30_000;

/** 取り込みの間隔。撮影のときだけ KOEKATA_TEAMS_SYNC_MS で短くできる。 */
export function teamsSyncMs(): number {
  const value = Number(process.env.KOEKATA_TEAMS_SYNC_MS);
  return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_SYNC_MS;
}
const REQUEST_TIMEOUT_MS = 8_000;
/** 画面を待たせない。間に合わなければ、次に開いたときに反映される */
const SYNC_WAIT_MS = 2_500;
const DEFAULT_LOCAL_CHANNEL = "study";

type Fetch = typeof fetch;
export type TeamsMode = "off" | "graph" | "webhook";

/** Teams へ届いたかどうか。画面に正直に出す。 */
export type TeamsDelivery =
  | { state: "off" }
  | { state: "sent" }
  | { state: "pending" }
  | { state: "skipped"; reason: "scope" | "kept" | "signin" | "unlinked" }
  | { state: "skipped"; reason: "refresh"; code: string | null }
  | { state: "failed" };

const DELIVERY_WAIT_MS = 4_000;
const deliveries = new Map<string, Promise<TeamsDelivery>>();

/** 送った結果を、長く待たずに受け取る。間に合わなければ確認中として返す。 */
export async function awaitTeamsDelivery(postId: string, waitMs = DELIVERY_WAIT_MS): Promise<TeamsDelivery> {
  const delivery = deliveries.get(postId);
  if (!delivery) return { state: "off" };
  deliveries.delete(postId);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<TeamsDelivery>((done) => {
    timer = setTimeout(() => done({ state: "pending" }), waitMs);
  });
  const result = await Promise.race([delivery, late]);
  clearTimeout(timer);
  return result;
}

export function teamsMode(): TeamsMode {
  // 試用は、送る人（デモの閉じたテナントのダミー）が決まっているときだけ送る
  if (process.env.KOEKATA_TEAMS === "off" || (isTrialMode() && !trialTeamsSender())) return "off";
  if (process.env.KOEKATA_TEAMS === "webhook") return process.env.KOEKATA_TEAMS_WEBHOOK_URL ? "webhook" : "off";
  return readGraphConfig() ? "graph" : "off";
}

type GraphMessage = {
  id: string;
  createdDateTime: string;
  deletedDateTime?: string | null;
  from: { user?: { id?: string; displayName?: string } | null } | null;
  body: { content: string; contentType?: string };
  replies?: GraphMessage[];
  /** 本文の <at id="n"> と対になる、メンションされた人 */
  mentions?: GraphMention[];
  reactions?: { reactionType?: string; user?: { user?: { id?: string; displayName?: string | null } | null } | null }[];
};

type GraphMention = {
  id: number;
  mentionText?: string;
  mentioned?: { user?: { id?: string; displayName?: string | null; userIdentityType?: string } | null } | null;
};

/** Graph へ送る本文。メンションがあるときだけ html にする。 */
export type TeamsMessageBody = {
  body: { contentType: "text" | "html"; content: string };
  mentions?: GraphMention[];
};

export type MentionTarget = { name: string; teamsUserId: string | null };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * 本文の「@名前」を Teams のメンションにする（0-2g）。Teams のユーザー ID が分からない人は、
 * メンションにせず名前だけを書く。メンションが1つもなければ、今までどおり文字で送る。
 */
export function buildTeamsMessage(text: string, targets: MentionTarget[]): TeamsMessageBody {
  const mentions: GraphMention[] = [];
  let html = escapeHtml(text);
  let plain = text;
  for (const target of targets) {
    const marker = `@${target.name}`;
    if (!plain.includes(marker)) continue;
    plain = plain.replace(marker, target.name);
    if (!target.teamsUserId) {
      html = html.replace(escapeHtml(marker), escapeHtml(target.name));
      continue;
    }
    const id = mentions.length;
    html = html.replace(escapeHtml(marker), `<at id="${id}">${escapeHtml(target.name)}</at>`);
    mentions.push({ id, mentionText: target.name, mentioned: { user: { id: target.teamsUserId, displayName: target.name, userIdentityType: "aadUser" } } });
  }
  if (mentions.length === 0) return { body: { contentType: "text", content: plain } };
  return { body: { contentType: "html", content: html.replace(/\r?\n/g, "<br>") }, mentions };
}

/** こえかたの人 → Teams のユーザー ID（サインインのときの記録の逆引き）。分からなければ null。 */
export function teamsUserIdOf(personId: string, linked: Record<string, string> = readLinkedPeople()): string | null {
  for (const [teamsUserId, linkedId] of Object.entries(linked)) if (linkedId === personId) return teamsUserId;
  return null;
}

/** 生徒には、生徒が見られないチャネル（職員室など）のお願いを渡さない。 */
export function canBeAsked(db: DatabaseSync, personId: string, channelId: string): boolean {
  const person = db.prepare("SELECT role FROM people WHERE id = ?").get(personId) as { role: string } | undefined;
  const channel = db.prepare("SELECT audience FROM channels WHERE id = ?").get(channelId) as { audience: string } | undefined;
  if (!person || !channel) return false;
  return channel.audience === "everyone" || person.role !== "student";
}

function mentionTarget(db: DatabaseSync, personId: string, linked: Record<string, string> = readLinkedPeople()): MentionTarget | null {
  const name = personName(db, personId);
  return name ? { name, teamsUserId: teamsUserIdOf(personId, linked) } : null;
}

/** 「聞いてみる」の投稿は、頭で相手をメンションする。本人が本文に @名前 を書いていればそこを使う。 */
export function askMessage(db: DatabaseSync, text: string, askedPersonId: string | undefined): TeamsMessageBody {
  const target = askedPersonId ? mentionTarget(db, askedPersonId) : null;
  if (!target) return buildTeamsMessage(text, []);
  const withHead = text.includes(`@${target.name}`) ? text : `@${target.name}さん\n${text}`;
  return buildTeamsMessage(withHead, [target]);
}

/** 返事の本文にある「@名前」のうち、その投稿を見られる人だけをメンションにする（回す、0-2g）。 */
export function replyMessage(db: DatabaseSync, viewerId: string, channelId: string, text: string): TeamsMessageBody {
  const people = db.prepare("SELECT id FROM people ORDER BY length(name) DESC").all() as { id: string }[];
  const linked = readLinkedPeople();
  const targets = people
    .filter((person) => person.id !== viewerId && canBeAsked(db, person.id, channelId))
    .map((person) => mentionTarget(db, person.id, linked))
    .filter((target): target is MentionTarget => target !== null && text.includes(`@${target.name}`));
  return buildTeamsMessage(text, targets);
}

/** Teams の HTML を文字だけにする。画面には HTML を出さない。メンションは「@名前」の見た目で残す（0-2g）。 */
export function plainText(html: string): string {
  return html
    .replace(/<at\b[^>]*>([\s\S]*?)<\/at>/gi, "@$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

async function graph<T>(fetcher: Fetch, token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetcher(`${GRAPH}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Graph ${response.status}`);
  return (await response.json()) as T;
}

type TeamsTarget = { team: string; channel: string };

/** チームとチャネルの名前 → メッセージの場所。名前から ID を探すのは1回だけ。 */
const cachedPaths = new Map<string, string>();

/** テストのための入口。チャネルの場所の控えを消す。 */
export function resetTeamsBridge(): void {
  cachedPaths.clear();
  lastSync = 0;
  running = null;
}

/** アプリのチャネルの送り先。対応表がなければ、全員が読めるチャネルだけを1か所へ。 */
export function teamsTargetFor(db: DatabaseSync, config: GraphConfig, channelId: string): TeamsTarget | null {
  if (config.channels) return Object.hasOwn(config.channels, channelId) ? config.channels[channelId] : null;
  if (!config.team || !config.channel || !isPublicChannel(db, channelId)) return null;
  return { team: config.team, channel: config.channel };
}

/** 読み取る先と、取り込むアプリのチャネル。 */
function syncTargets(config: GraphConfig): { target: TeamsTarget; channelId: string }[] {
  if (config.channels) return Object.entries(config.channels).map(([channelId, target]) => ({ target, channelId }));
  if (!config.team || !config.channel) return [];
  return [{ target: { team: config.team, channel: config.channel }, channelId: config.localChannel ?? DEFAULT_LOCAL_CHANNEL }];
}

async function channelPath(fetcher: Fetch, token: string, target: TeamsTarget): Promise<string> {
  const key = `${target.team}\n${target.channel}`;
  const cached = cachedPaths.get(key);
  if (cached) return cached;
  const { value: teams } = await graph<{ value: { id: string; displayName: string }[] }>(fetcher, token, "/me/joinedTeams");
  const team = teams.find((item) => item.displayName === target.team);
  if (!team) throw new Error("チームが見つかりません");
  const { value: channels } = await graph<{ value: { id: string; displayName: string }[] }>(fetcher, token, `/teams/${team.id}/channels`);
  const channel = channels.find((item) => item.displayName === target.channel);
  if (!channel) throw new Error("チャネルが見つかりません");
  const path = `/teams/${team.id}/channels/${encodeURIComponent(channel.id)}/messages`;
  cachedPaths.set(key, path);
  return path;
}

function saveLink(db: DatabaseSync, localId: string, kind: "post" | "reply", teamsId: string): void {
  db.prepare("INSERT OR IGNORE INTO teams_links (local_id, kind, teams_id) VALUES (?, ?, ?)").run(localId, kind, teamsId);
}

const teamsIdOf = (db: DatabaseSync, localId: string) =>
  (db.prepare("SELECT teams_id FROM teams_links WHERE local_id = ?").get(localId) as { teams_id: string } | undefined)?.teams_id ?? null;

const localIdOf = (db: DatabaseSync, teamsId: string) =>
  (db.prepare("SELECT local_id FROM teams_links WHERE teams_id = ?").get(teamsId) as { local_id: string } | undefined)?.local_id ?? null;

/** 取り消したときに、Teams に届いた分が残るかどうか。 */
export function reachedTeams(db: DatabaseSync, postId: string): boolean {
  return teamsIdOf(db, postId) !== null;
}

/** 失敗の中身だけを残す。URL とトークンは出さない。 */
function logFailure(what: string, error: unknown): void {
  console.error(`Teams への${what}に失敗`, error instanceof Error ? error.message.slice(0, 80) : "unknown");
}

function isPublicChannel(db: DatabaseSync, channelId: string): boolean {
  const row = db.prepare("SELECT audience FROM channels WHERE id = ?").get(channelId) as { audience: string } | undefined;
  return row?.audience === "everyone";
}

/**
 * 全員向けで、確認の印がなく、送り先のあるチャネルの投稿か。送らない理由を返す。
 * 確認の印は本人に見せない決まりなので、理由を分けずに「校内だけ」と伝える。
 * 教職員だけのチャネルも、対応表で教職員のチームへ向けていれば送る。
 */
function whyStays(db: DatabaseSync, channelId: string, options: CreatePostOptions, config: GraphConfig | null): "scope" | "kept" | null {
  if ((options.scope ?? "everyone") !== "everyone") return "scope";
  if (options.needsLook) return "kept";
  if (config ? !teamsTargetFor(db, config, channelId) : !isPublicChannel(db, channelId)) return "kept";
  return null;
}

const personName = (db: DatabaseSync, personId: string) =>
  (db.prepare("SELECT name FROM people WHERE id = ?").get(personId) as { name: string } | undefined)?.name ?? "";

export async function sendPostToTeams(db: DatabaseSync, viewerId: string, postId: string, channelId: string, body: string, options: CreatePostOptions = {}, fetcher: Fetch = fetch): Promise<TeamsDelivery> {
  const mode = teamsMode();
  if (mode === "off") return { state: "off" };
  const config = mode === "graph" ? readGraphConfig() : null;
  const stays = whyStays(db, channelId, options, config);
  if (stays) return { state: "skipped", reason: stays };
  try {
    if (mode === "webhook") {
      await sendWebhookCard(personName(db, viewerId), body, fetcher);
      return { state: "sent" };
    }
    // 本人の名前で届けるので、本人がサインインしていなければ送らない。試用では決めたダミーの名前で届ける
    const target = config && teamsTargetFor(db, config, channelId);
    if (!target) return { state: "skipped", reason: "unlinked" };
    const result = await getAccessTokenResult(fetcher, Date.now(), trialTeamsSender() ?? viewerId);
    if ("error" in result) {
      // 取れなかった本当の理由を画面に出す（0-1p）。前はどれも「サインインしていません」と出していた
      if (result.error === "refresh") return { state: "skipped", reason: "refresh", code: result.code };
      if (result.error === "network") return { state: "failed" };
      return { state: "skipped", reason: "signin" };
    }
    const token = result.token;
    const path = await channelPath(fetcher, token, target);
    const sent = await graph<{ id: string }>(fetcher, token, path, askMessage(db, body, options.askedPersonId));
    saveLink(db, postId, "post", sent.id);
    return { state: "sent" };
  } catch (error) {
    logFailure("投稿", error);
    return { state: "failed" };
  }
}

export async function sendReplyToTeams(db: DatabaseSync, viewerId: string, replyId: string, postId: string, body: string, fetcher: Fetch = fetch): Promise<void> {
  if (teamsMode() !== "graph") return;
  const parent = teamsIdOf(db, postId);
  if (!parent) return;
  try {
    const config = readGraphConfig();
    const token = await getAccessToken(fetcher, Date.now(), trialTeamsSender() ?? viewerId);
    const channelId = (db.prepare("SELECT channel_id FROM posts WHERE id = ?").get(postId) as { channel_id: string } | undefined)?.channel_id;
    const target = config && channelId ? teamsTargetFor(db, config, channelId) : null;
    if (!target || !token) return;
    const path = await channelPath(fetcher, token, target);
    const sent = await graph<{ id: string }>(fetcher, token, `${path}/${parent}/replies`, replyMessage(db, viewerId, channelId as string, body));
    saveLink(db, replyId, "reply", sent.id);
  } catch (error) {
    logFailure("返信", error);
  }
}

/** アプリのいいねを、Teams の元の投稿にも本人の名前のリアクションで付ける（外したら外す）。 */
export async function sendReactionToTeams(db: DatabaseSync, viewerId: string, postId: string, liked: boolean, fetcher: Fetch = fetch): Promise<void> {
  if (teamsMode() !== "graph") return;
  const message = teamsIdOf(db, postId);
  if (!message) return;
  try {
    const config = readGraphConfig();
    const token = await getAccessToken(fetcher, Date.now(), trialTeamsSender() ?? viewerId);
    const channelId = (db.prepare("SELECT channel_id FROM posts WHERE id = ?").get(postId) as { channel_id: string } | undefined)?.channel_id;
    const target = config && channelId ? teamsTargetFor(db, config, channelId) : null;
    if (!target || !token) return;
    const path = await channelPath(fetcher, token, target);
    const response = await fetcher(`${GRAPH}${path}/${message}/${liked ? "setReaction" : "unsetReaction"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reactionType: "👍" }), // Teams は絵文字そのもので受け取る（"like" は通らない）
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Graph ${response.status}`);
  } catch (error) {
    logFailure("いいね", error);
  }
}

/** Teams で付いたリアクションを、アプリのいいねとして取り込む。本人の投稿への本人のいいねは数えない */
function importReactions(db: DatabaseSync, message: GraphMessage, postId: string, linked: Record<string, string>): void {
  const author = (db.prepare("SELECT author_id FROM posts WHERE id = ?").get(postId) as { author_id: string } | undefined)?.author_id;
  for (const reaction of message.reactions ?? []) {
    const personId = matchPerson(db, { from: { user: reaction.user?.user ?? null } } as GraphMessage, linked);
    if (personId && personId !== author) db.prepare("INSERT OR IGNORE INTO post_likes (post_id, person_id) VALUES (?, ?)").run(postId, personId);
  }
}

/** Workflow の「Webhook を受けたらチャネルに投稿」へカードを送る（予備）。 */
async function sendWebhookCard(author: string, body: string, fetcher: Fetch): Promise<void> {
  const url = process.env.KOEKATA_TEAMS_WEBHOOK_URL;
  if (!url) return;
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.4",
            body: [
              { type: "TextBlock", text: author, weight: "Bolder" },
              { type: "TextBlock", text: body, wrap: true },
            ],
          },
        },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Workflow ${response.status}`);
}

/** 表示名の末尾の役割の括弧（例：「白石 文（養護教諭）」）を外す。 */
export function nameWithoutRole(displayName: string): string {
  return displayName.replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim();
}

/** Teams の人を、こえかたの人物に対応させる。サインインの記録を優先し、なければ同じ名前の人。 */
function matchPerson(db: DatabaseSync, message: GraphMessage, linked: Record<string, string>): string | null {
  const user = message.from?.user;
  if (user?.id && linked[user.id]) return linked[user.id];
  if (!user?.displayName) return null;
  return (db.prepare("SELECT id FROM people WHERE name = ?").get(nameWithoutRole(user.displayName)) as { id: string } | undefined)?.id ?? null;
}

/**
 * こえかたから送った直後で印がまだない投稿を、二重に取り込まない。
 * メンションを付けて送った分は、Teams では「@」が外れ、頭に相手の名前が付くので、それも同じものとみなす。
 */
function unlinkedLocal(db: DatabaseSync, table: "posts" | "replies", authorId: string, body: string): string | null {
  const rows = db
    .prepare(`SELECT id, body FROM ${table} WHERE author_id = ? AND id NOT IN (SELECT local_id FROM teams_links) ORDER BY created_at DESC LIMIT 20`)
    .all(authorId) as { id: string; body: string }[];
  const same = (local: string) => {
    const bare = local.replace(/@/g, "");
    return local === body || bare === body || body.endsWith(`\n${bare}`);
  };
  return rows.find((row) => same(row.body))?.id ?? null;
}

/** Teams のメンションを、こえかたの人にする。 */
function mentionedPeople(db: DatabaseSync, message: GraphMessage, linked: Record<string, string>): string[] {
  return (message.mentions ?? [])
    .map((mention) => matchPerson(db, { from: { user: mention.mentioned?.user ?? null } } as GraphMessage, linked))
    .filter((personId): personId is string => personId !== null);
}

/**
 * Teams で直接メンションされた投稿や返事を、メンションされた人の受信箱に入れる（0-2g）。
 * 見るのは初めて取り込むときだけ（あとで回したお願いを、同期のたびに戻さない）。
 * 生徒には生徒が見られないチャネルのお願いを渡さず、投稿した本人とメンションした本人には入れない。
 * 今のお願いの相手が返事で別の人をメンションしたら、アプリの「回す」と同じくパスとして残す。
 */
function askFromMentions(db: DatabaseSync, postId: string, mentionerId: string, mentioned: string[], createdAt: string): void {
  const post = db.prepare("SELECT channel_id, author_id, scope, asked_person_id FROM posts WHERE id = ?").get(postId) as
    | { channel_id: string; author_id: string; scope: string; asked_person_id: string | null }
    | undefined;
  if (!post || post.scope !== "everyone") return;
  const to = mentioned.find((personId) => personId !== mentionerId && personId !== post.author_id && canBeAsked(db, personId, post.channel_id));
  if (!to || to === post.asked_person_id) return;
  if (post.asked_person_id && post.asked_person_id === mentionerId) {
    db.prepare("INSERT INTO post_passes (id, post_id, from_person_id, to_person_id, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), postId, mentionerId, to, createdAt);
  }
  db.prepare("UPDATE posts SET asked_person_id = ? WHERE id = ?").run(to, postId);
}

/** Teams の投稿と返信を DB へ取り込む。本文のないもの（Workflow のカードなど）と、対応する人がいないものは飛ばす。 */
export async function syncFromTeams(db: DatabaseSync, fetcher: Fetch = fetch): Promise<void> {
  if (teamsMode() !== "graph") return;
  const config = readGraphConfig();
  const token = await getAccessToken(fetcher);
  if (!config || !token) return;
  const linked = readLinkedPeople();
  for (const { target, channelId } of syncTargets(config)) {
    try {
      await syncChannel(db, fetcher, token, target, channelId, linked);
    } catch (error) {
      // 1つのチャネルが読めなくても、ほかのチャネルは取り込む
      logFailure("読み取り", error);
    }
  }
}

async function syncChannel(db: DatabaseSync, fetcher: Fetch, token: string, target: TeamsTarget, channelId: string, linked: Record<string, string>): Promise<void> {
  const path = await channelPath(fetcher, token, target);
  const { value: messages } = await graph<{ value: GraphMessage[] }>(fetcher, token, `${path}?$top=30&$expand=replies`);
  // 古いものから取り込む
  for (const message of [...messages].reverse()) {
    if (message.deletedDateTime) continue;
    const postId = importPost(db, message, linked, channelId);
    if (!postId) continue;
    importReactions(db, message, postId, linked);
    for (const reply of [...(message.replies ?? [])].sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime))) {
      if (!reply.deletedDateTime) importReply(db, reply, postId, linked);
    }
  }
}

function importPost(db: DatabaseSync, message: GraphMessage, linked: Record<string, string>, channelId: string): string | null {
  const known = localIdOf(db, message.id);
  if (known) return known;
  const text = plainText(message.body.content);
  const authorId = matchPerson(db, message, linked);
  if (!text || !authorId) return null;
  const pending = unlinkedLocal(db, "posts", authorId, text);
  if (pending) {
    saveLink(db, pending, "post", message.id);
    return pending;
  }
  const id = randomUUID();
  db.prepare("INSERT INTO posts (id, channel_id, author_id, kind, body, created_at) VALUES (?, ?, ?, 'report', ?, ?)").run(id, channelId, authorId, text, message.createdDateTime);
  saveLink(db, id, "post", message.id);
  askFromMentions(db, id, authorId, mentionedPeople(db, message, linked), message.createdDateTime);
  return id;
}

function importReply(db: DatabaseSync, reply: GraphMessage, postId: string, linked: Record<string, string>): void {
  if (localIdOf(db, reply.id)) return;
  const text = plainText(reply.body.content);
  const authorId = matchPerson(db, reply, linked);
  if (!text || !authorId) return;
  const pending = unlinkedLocal(db, "replies", authorId, text);
  if (pending) {
    saveLink(db, pending, "reply", reply.id);
    return;
  }
  const id = randomUUID();
  db.prepare("INSERT INTO replies (id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(id, postId, authorId, text, reply.createdDateTime);
  saveLink(db, id, "reply", reply.id);
  askFromMentions(db, postId, authorId, mentionedPeople(db, reply, linked), reply.createdDateTime);
}

let lastSync = 0;
let running: Promise<void> | null = null;

/** 画面を開いたときの取り込み。間隔を空け、画面を長く待たせず、失敗しても画面は出す。 */
export async function syncFromTeamsIfStale(db: DatabaseSync, fetcher: Fetch = fetch, now = Date.now()): Promise<void> {
  if (teamsMode() !== "graph") return;
  if (!running && now - lastSync >= teamsSyncMs()) {
    lastSync = now;
    running = syncFromTeams(db, fetcher)
      .catch((error) => logFailure("読み取り", error))
      .finally(() => {
        running = null;
      });
  }
  if (running) await Promise.race([running, new Promise((done) => setTimeout(done, SYNC_WAIT_MS))]);
}

/** 投稿先を包み、こえかたの DB に残したあとで Teams へも届ける。 */
export function withTeamsBridge(inner: PostDestination, db: DatabaseSync): PostDestination {
  if (teamsMode() === "off") return inner;
  return {
    ...inner,
    createPost(viewerId, channelId, body, options) {
      const id = inner.createPost(viewerId, channelId, body, options);
      deliveries.set(id, sendPostToTeams(db, viewerId, id, channelId, body.trim(), options));
      return id;
    },
    createReply(viewerId, postId, body) {
      const id = inner.createReply(viewerId, postId, body);
      void sendReplyToTeams(db, viewerId, id, postId, body.trim());
      return id;
    },
    toggleLike(viewerId, postId) {
      inner.toggleLike(viewerId, postId);
      const liked = db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND person_id = ?").get(postId, viewerId) !== undefined;
      void sendReactionToTeams(db, viewerId, postId, liked);
    },
  };
}
