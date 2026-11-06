import { describe, expect, it } from "vitest";
import { SITES, siteEnv } from "../../scripts/judge.mjs";

const base = {
  ANTHROPIC_API_KEY: "sk-test",
  KOEKATA_TRIAL_TEAMS_AS: "aoki",
  KOEKATA_TEAMS_WEBHOOK_URL: "https://example.invalid/hook",
  KOEKATA_ACCESS_CODE: "999999",
};
const site = (name: string) => (SITES as { name: string }[]).find((s) => s.name === name)!;

describe("審査用のサーバーに渡す設定", () => {
  it("審査員用は合言葉つき・本物の Claude・Teams へは送らない", () => {
    const env = siteEnv(site("judge"), base, { slot: ".next-a", code: "123456" });
    expect(env.KOEKATA_ACCESS_CODE).toBe("123456");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(env.KOEKATA_TEAMS).toBe("off");
    expect(env.KOEKATA_TRIAL_TEAMS_AS).toBeUndefined();
    expect(env.KOEKATA_TEAMS_WEBHOOK_URL).toBeUndefined();
    expect(env.KOEKATA_CLAUDE_PER_HOUR).toMatch(/^\d+$/);
  });

  it("みんな用は合言葉なし・台本モードで、キーそのものを渡さない", () => {
    const env = siteEnv(site("public"), base, { slot: ".next-a", code: "123456" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.KOEKATA_CLAUDE).toBe("scripted");
    expect(env.KOEKATA_ACCESS_CODE).toBeUndefined();
    expect(env.KOEKATA_TEAMS).toBe("off");
  });

  it("昼休みの試用版（3201/3202）とポートが重ならない", () => {
    const ports = (SITES as { port: number }[]).map((s) => s.port);
    expect(ports).not.toContain(3201);
    expect(ports).not.toContain(3202);
  });
});
