import { describe, expect, it } from "vitest";
import { TEAMS_HOME, teamsChannelUrl } from "./teams-link";

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
