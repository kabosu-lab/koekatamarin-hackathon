import { describe, expect, it } from "vitest";
import { TEAMS_HOME, teamsChannelUrl, teamsDockUrl } from "./teams-link";

describe("みんなの下の帯の「Teams」が開く先", () => {
  it("つながりの設定がなければ、Teams のはじめの画面", () => {
    expect(teamsChannelUrl(null)).toBe(TEAMS_HOME);
    expect(teamsChannelUrl({ tenant: "dummy-tenant" })).toBe(TEAMS_HOME);
  });

  it("送り先のチームとチャネルがあれば、そのチャネルを開く", () => {
    const url = new URL(teamsChannelUrl({ tenant: "dummy-tenant", team: "dummy-team", channel: "19:dummy@thread.tacv2" }));
    expect(url.origin).toBe("https://teams.microsoft.com");
    expect(url.pathname.startsWith("/l/channel/19%3Adummy%40thread.tacv2/")).toBe(true);
    expect(url.searchParams.get("groupId")).toBe("dummy-team");
    expect(url.searchParams.get("tenantId")).toBe("dummy-tenant");
  });

  it("チャネルの対応表があるときは、そちらを優先する", () => {
    const url = new URL(
      teamsChannelUrl({ tenant: "t", team: "old-team", channel: "old", channels: { study: { team: "map-team", channel: "map-channel" } } }),
    );
    expect(url.searchParams.get("groupId")).toBe("map-team");
    expect(url.pathname).toContain("/map-channel/");
  });
});

describe("下の帯に「Teams」を置くか（0-2q(6)）", () => {
  it("Teams につないでいないとき（台本モードで設定がない・Teams オフ）は置かない", () => {
    expect(teamsDockUrl("off", null)).toBeNull();
    expect(teamsDockUrl("off", { tenant: "dummy-tenant", team: "dummy-team", channel: "dummy" })).toBeNull();
  });

  it("つないでいるときは、そのチャネルか Teams のはじめの画面を開く", () => {
    expect(teamsDockUrl("webhook", null)).toBe(TEAMS_HOME);
    expect(teamsDockUrl("graph", { tenant: "t", team: "dummy-team", channel: "dummy" })).toContain("groupId=dummy-team");
  });
});
