import { describe, expect, it } from "vitest";
import { changedUrls, parseTunnelUrl, tunnelsToStart, watchPlan } from "../../scripts/judge-tunnel.mjs";
import { siteEnv, SITES as JUDGE_SITES } from "../../scripts/judge.mjs";

const SITES = [
  { name: "judge", label: "審査員用", port: 3301 },
  { name: "public", label: "みんな用", port: 3302 },
];
const ok = { local: true, tunnelAlive: true, outside: true };

describe("cloudflared の出力から URL を読む", () => {
  it("一時トンネルの URL を取り出す", () => {
    const log = "2026-11-07T00:00:00Z INF |  https://abc-def-123.trycloudflare.com  |\nINF Registered tunnel connection";
    expect(parseTunnelUrl(log)).toBe("https://abc-def-123.trycloudflare.com");
  });

  it("まだ出ていなければ null。ほかの URL は拾わない", () => {
    expect(parseTunnelUrl("")).toBeNull();
    expect(parseTunnelUrl("INF Requesting new quick Tunnel on https://api.trycloudflare.com/x")).toBeNull();
    expect(parseTunnelUrl("see https://www.cloudflare.com/website-terms/")).toBeNull();
  });
});

describe("開き直すトンネル", () => {
  it("プロセスが止まっているものだけ", () => {
    const tunnels = { judge: 100, public: 200 };
    expect(tunnelsToStart(SITES, tunnels, (pid?: number) => pid === 100)).toEqual(["public"]);
    expect(tunnelsToStart(SITES, tunnels, () => true)).toEqual([]);
    expect(tunnelsToStart(SITES, undefined, () => false)).toEqual(["judge", "public"]);
  });
});

describe("見張りの判断", () => {
  it("全部動いていれば何もしない", () => {
    expect(watchPlan(SITES, { judge: ok, public: ok }, "tunnel")).toEqual({ restartServers: false, restartTunnels: [], problems: [] });
  });

  it("サーバーが落ちていたらサーバーだけ起こし直し、トンネルには触らない", () => {
    const plan = watchPlan(SITES, { judge: { ...ok, local: false, outside: false }, public: ok }, "tunnel");
    expect(plan.restartServers).toBe(true);
    expect(plan.restartTunnels).toEqual([]);
  });

  it("cloudflared が止まっていたら、そのトンネルだけ開き直す", () => {
    const plan = watchPlan(SITES, { judge: ok, public: { ...ok, tunnelAlive: false, outside: null } }, "tunnel");
    expect(plan.restartServers).toBe(false);
    expect(plan.restartTunnels).toEqual(["public"]);
  });

  it("cloudflared が動いていて外から開けないだけなら、知らせるが触らない", () => {
    const plan = watchPlan(SITES, { judge: { ...ok, outside: false }, public: ok }, "tunnel");
    expect(plan.restartServers).toBe(false);
    expect(plan.restartTunnels).toEqual([]);
    expect(plan.problems).toHaveLength(1);
  });

  it("トンネルで出していないときは、トンネルを開かない", () => {
    const plan = watchPlan(SITES, { judge: { local: true, tunnelAlive: null, outside: false }, public: { local: true, tunnelAlive: null, outside: null } }, "funnel");
    expect(plan.restartTunnels).toEqual([]);
    expect(plan.problems[0]).toContain("Tailscale");
  });
});

describe("URL が変わったか", () => {
  it("変わった場所の名前だけを返す（URL は返さない）", () => {
    const before = { judge: "https://a.trycloudflare.com", public: "https://b.trycloudflare.com" };
    expect(changedUrls(SITES, before, { ...before })).toEqual([]);
    expect(changedUrls(SITES, before, { ...before, public: "https://c.trycloudflare.com" })).toEqual(["みんな用"]);
    expect(changedUrls(SITES, undefined, before)).toEqual(["審査員用", "みんな用"]);
  });
});

describe("審査用のアクセス元の許可", () => {
  it("一時トンネル（*.trycloudflare.com）からの Server Actions を通す", () => {
    const site = (JUDGE_SITES as { name: string }[]).find((s) => s.name === "judge")!;
    const env = siteEnv(site, {}, { slot: ".next-a", code: "123456" });
    expect(env.KOEKATA_ALLOWED_ORIGINS.split(",")).toContain("*.trycloudflare.com");
  });
});
