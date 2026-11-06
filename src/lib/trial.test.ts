import { afterEach, describe, expect, it, vi } from "vitest";
import { trialNotice, trialSendsToTeams } from "./trial";

afterEach(() => vi.unstubAllEnvs());

describe("試用の一文", () => {
  it("Teams へ送る人が決まっている試用では、Teams に届くことを書く", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "aoki");
    vi.stubEnv("KOEKATA_TEAMS", "");
    expect(trialSendsToTeams()).toBe(true);
    expect(trialNotice()).toContain("練習用の Teams");
  });

  it("審査員用のように Teams へ送らない試用では、Teams のことを書かない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "");
    expect(trialSendsToTeams()).toBe(false);
    expect(trialNotice()).not.toContain("Teams");
    expect(trialNotice()).toContain("相談室には届かない");
  });

  it("送る人がいても、Teams を止めていれば書かない", () => {
    vi.stubEnv("KOEKATA_ACCESS_CODE", "123456");
    vi.stubEnv("KOEKATA_TRIAL_TEAMS_AS", "aoki");
    vi.stubEnv("KOEKATA_TEAMS", "off");
    expect(trialNotice()).not.toContain("Teams");
  });
});
