import { type TeamsMode, teamsMode } from "@/lib/destination/teams-bridge";
import { type GraphConfig, readGraphConfig } from "@/lib/graph/auth";

/** つながりの設定がないときに開く、Teams の入口 */
export const TEAMS_HOME = "https://teams.microsoft.com/";

/**
 * 「みんな」の下の帯の「Teams」が開く先（0-2f(4)）。data/teams.json に送り先のチームとチャネルがあれば、
 * そのチャネルを本物の Teams で開く。なければ Teams のはじめの画面。
 */
export function teamsChannelUrl(config: Pick<GraphConfig, "tenant" | "team" | "channel" | "channels"> | null): string {
  // 対応表があるときはそちらが優先（src/lib/graph/auth.ts の GraphConfig と同じ順）
  const target = config?.channels ? Object.values(config.channels)[0] : config?.team && config.channel ? { team: config.team, channel: config.channel } : undefined;
  if (!target?.team || !target.channel) return TEAMS_HOME;
  const query = new URLSearchParams({ groupId: target.team });
  if (config?.tenant) query.set("tenantId", config.tenant);
  // 2つめの区切りはチャネルの表示名。Teams は ID で開くので、名前は何でもよい
  return `${TEAMS_HOME}l/channel/${encodeURIComponent(target.channel)}/${encodeURIComponent("校内チャネル")}?${query}`;
}

/**
 * 下の帯に「Teams」を置くときの開く先。Teams につないでいないとき（台本モードで設定がない、Teams オフ）は null で、帯から外す（0-2f(4)・0-2q(6)）。
 */
export function teamsDockUrl(mode: TeamsMode, config: Parameters<typeof teamsChannelUrl>[0]): string | null {
  return mode === "off" ? null : teamsChannelUrl(config);
}

export function teamsUrl(): string | null {
  return teamsDockUrl(teamsMode(), readGraphConfig());
}

/**
 * 0-3e：みんなの投稿に小さく出すチャネル名の行き先。Teams につないでいて、そのチャネルが Teams のチャネルにつながっていれば、
 * 本物の Teams のそのチャネル（external）。つないでいないとき・対応表に載っていないチャネル（アプリの中に残る）は、アプリの校内チャネルの画面。
 */
export function postChannelUrl(
  mode: TeamsMode,
  config: Pick<GraphConfig, "tenant" | "team" | "channel" | "channels"> | null,
  channelId: string,
  postId?: string,
): { href: string; external: boolean } {
  const inApp = { href: `/teams?channel=${encodeURIComponent(channelId)}${postId ? `#post-${postId}` : ""}`, external: false };
  if (mode === "off" || !config) return inApp;
  // 対応表があるときは、載っているチャネルだけが Teams につながる（src/lib/graph/auth.ts）
  const target = config.channels ? config.channels[channelId] : config.team && config.channel ? { team: config.team, channel: config.channel } : undefined;
  if (!target?.team || !target.channel) return inApp;
  return { href: teamsChannelUrl({ tenant: config.tenant, team: target.team, channel: target.channel }), external: true };
}

/** 今の設定で、投稿のチャネル名の行き先を決める */
export function postChannelLinker(): (channelId: string, postId?: string) => { href: string; external: boolean } {
  const mode = teamsMode();
  const config = readGraphConfig();
  return (channelId, postId) => postChannelUrl(mode, config, channelId, postId);
}
