import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, readGraphConfig, startDeviceLogin } from "./auth";

const CONFIG = { tenant: "example.test", clientId: "dummy-client" };
let dir: string;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "koekata-graph-"));
  vi.stubEnv("KOEKATA_GRAPH_DIR", dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("Graph のサインイン", () => {
  it("設定がなければ、通信せずに null を返す", async () => {
    const fetcher = vi.fn();
    expect(readGraphConfig()).toBeNull();
    expect(await getAccessToken(fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("設定だけでサインインがなければ、通信しない", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify(CONFIG));
    const fetcher = vi.fn();
    expect(await getAccessToken(fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("本人がサインインするまで待ち、トークンを保存して使う。シークレットは送らない", async () => {
    const bodies: string[] = [];
    const answers = [
      json({ device_code: "d", user_code: "ABC", verification_uri: "https://example.test/device", expires_in: 60, interval: 1 }),
      json({ error: "authorization_pending" }, 400),
      json({ access_token: "a1", refresh_token: "r1", expires_in: 3600 }),
    ];
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return answers.shift()!;
    });
    writeFileSync(join(dir, "teams.json"), JSON.stringify(CONFIG));
    const login = await startDeviceLogin(CONFIG, fetcher as unknown as typeof fetch, async () => undefined);
    expect(login.userCode).toBe("ABC");
    await login.poll();
    expect(existsSync(join(dir, "teams-token.json"))).toBe(true);
    expect(bodies.join()).not.toContain("client_secret");
    expect(await getAccessToken(vi.fn() as unknown as typeof fetch)).toBe("a1");
  });

  it("期限が切れたら取り直し、新しい値を保存する", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify(CONFIG));
    writeFileSync(join(dir, "teams-token.json"), JSON.stringify({ accessToken: "old", refreshToken: "r1", expiresAt: 0 }));
    const fetcher = vi.fn(async () => json({ access_token: "new", expires_in: 3600 }));
    expect(await getAccessToken(fetcher as unknown as typeof fetch, 1000)).toBe("new");
    expect(JSON.parse(readFileSync(join(dir, "teams-token.json"), "utf8")).refreshToken).toBe("r1");
  });

  it("取り直せなければ null を返す", async () => {
    writeFileSync(join(dir, "teams.json"), JSON.stringify(CONFIG));
    writeFileSync(join(dir, "teams-token.json"), JSON.stringify({ accessToken: "old", refreshToken: "r1", expiresAt: 0 }));
    const fetcher = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    expect(await getAccessToken(fetcher as unknown as typeof fetch, 1000)).toBeNull();
  });
});
