import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Microsoft Graph のサインイン（委任、デバイスコード）。シークレットは使わない。
 * テナントと ID、トークンは Git に入らない data/ にだけ置く。設定がなければ何も通信しない。
 */
export const SCOPES = [
  "offline_access",
  "User.Read",
  "Team.ReadBasic.All",
  "Channel.ReadBasic.All",
  "ChannelMessage.Send",
  "ChannelMessage.Read.All",
].join(" ");

export type GraphConfig = {
  tenant: string;
  clientId: string;
  team?: string;
  channel?: string;
  /** Teams の投稿を読み込む先のチャネル。ないときは study */
  localChannel?: string;
  /**
   * アプリのチャネル → Teams のチームとチャネルの対応表。あるときは team/channel より優先し、
   * 載っているチャネルだけを送り、読み、元のチャネルに取り込む。載っていないチャネルはアプリの中に残す。
   */
  channels?: Record<string, { team: string; channel: string }>;
};
type StoredToken = { accessToken: string; refreshToken: string; expiresAt: number };
type Fetch = typeof fetch;

const dataDir = () => process.env.KOEKATA_GRAPH_DIR ?? "data";
const configPath = () => join(dataDir(), "teams.json");
const peoplePath = () => join(dataDir(), "teams-people.json");
/** personId がないトークンは読み取り用（投稿には使わない） */
const tokenPath = (personId?: string) => join(dataDir(), personId ? `teams-token-${personId}.json` : "teams-token.json");
/** 期限の直前に切れないよう、少し早めに取り直す */
const EXPIRY_MARGIN_MS = 60_000;

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readGraphConfig(): GraphConfig | null {
  const config = readJson<GraphConfig>(configPath());
  return config?.tenant && config.clientId ? config : null;
}

/** Teams のユーザー ID と、こえかたの人物の対応。サインインのときに記録する。 */
export function readLinkedPeople(): Record<string, string> {
  return readJson<Record<string, string>>(peoplePath()) ?? {};
}

export function linkPerson(graphUserId: string, personId: string): void {
  mkdirSync(dirname(peoplePath()), { recursive: true });
  writeFileSync(peoplePath(), JSON.stringify({ ...readLinkedPeople(), [graphUserId]: personId }));
}

type TokenBody = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

function saveToken(body: TokenBody, previousRefresh: string | undefined, now: number, personId?: string): StoredToken {
  const refreshToken = body.refresh_token ?? previousRefresh;
  if (!body.access_token || !refreshToken) throw new Error("トークンを受け取れませんでした");
  const token: StoredToken = { accessToken: body.access_token, refreshToken, expiresAt: now + (body.expires_in ?? 0) * 1000 };
  mkdirSync(dirname(tokenPath(personId)), { recursive: true });
  writeFileSync(tokenPath(personId), JSON.stringify(token));
  return token;
}

function formBody(values: Record<string, string>) {
  return { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values).toString() };
}

const authority = (config: GraphConfig) => `https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0`;

export type DeviceCode = { userCode: string; verificationUri: string; expiresIn: number; poll(): Promise<void> };

/** デバイスコードのサインインを始める。poll は本人がサインインするまで待ち、トークンを保存する。 */
export async function startDeviceLogin(
  config: GraphConfig,
  fetcher: Fetch = fetch,
  wait = (ms: number) => new Promise((done) => setTimeout(done, ms)),
  personId?: string,
): Promise<DeviceCode> {
  const response = await fetcher(`${authority(config)}/devicecode`, formBody({ client_id: config.clientId, scope: SCOPES }));
  const body = (await response.json()) as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; error?: string };
  if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri) {
    throw new Error(`サインインを始められませんでした（${body.error ?? response.status}）`);
  }
  const deviceCode = body.device_code;
  const expiresIn = body.expires_in ?? 900;
  let interval = (body.interval ?? 5) * 1000;
  return {
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn,
    async poll() {
      const deadline = Date.now() + expiresIn * 1000;
      while (Date.now() < deadline) {
        await wait(interval);
        const tokenResponse = await fetcher(
          `${authority(config)}/token`,
          formBody({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: config.clientId, device_code: deviceCode }),
        );
        const token = (await tokenResponse.json()) as TokenBody;
        if (tokenResponse.ok) {
          saveToken(token, undefined, Date.now(), personId);
          return;
        }
        if (token.error === "slow_down") interval += 5000;
        else if (token.error !== "authorization_pending") throw new Error(`サインインできませんでした（${token.error ?? tokenResponse.status}）`);
      }
      throw new Error("サインインの時間が切れました");
    },
  };
}

/** 使えるアクセストークンを返す。設定かサインインがなければ null（通信しない）。 */
export async function getAccessToken(fetcher: Fetch = fetch, now = Date.now(), personId?: string): Promise<string | null> {
  const config = readGraphConfig();
  const stored = readJson<StoredToken>(tokenPath(personId));
  if (!config || !stored) return null;
  if (stored.expiresAt - EXPIRY_MARGIN_MS > now) return stored.accessToken;
  const response = await fetcher(`${authority(config)}/token`, formBody({ grant_type: "refresh_token", client_id: config.clientId, refresh_token: stored.refreshToken, scope: SCOPES }));
  if (!response.ok) return null;
  return saveToken((await response.json()) as TokenBody, stored.refreshToken, now, personId).accessToken;
}
