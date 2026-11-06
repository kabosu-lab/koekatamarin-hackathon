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

export function teamsUrl(): string {
  return teamsChannelUrl(readGraphConfig());
}
