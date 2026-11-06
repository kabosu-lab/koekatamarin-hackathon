import { describe, expect, it } from "vitest";
import { accessCookieHeader, accessToken, codeMatches, decideGate, tokenMatches } from "./access";

const CODE = "test-code";

describe("合言葉", () => {
  it("合っているときだけ通す（前後の空白は許す）", () => {
    expect(codeMatches("test-code", CODE)).toBe(true);
    expect(codeMatches(" test-code\n", CODE)).toBe(true);
    expect(codeMatches("test-cod", CODE)).toBe(false);
    expect(codeMatches("", CODE)).toBe(false);
    expect(codeMatches(null, CODE)).toBe(false);
    expect(codeMatches("x".repeat(201), CODE)).toBe(false);
  });

  it("cookie に合言葉そのものを入れず、必要な属性を付ける", () => {
    const header = accessCookieHeader(CODE);
    expect(header).not.toContain(CODE);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });

  it("合言葉を変えると、前の cookie は使えない", () => {
    expect(tokenMatches(accessToken(CODE), CODE)).toBe(true);
    expect(tokenMatches(accessToken("old-code"), CODE)).toBe(false);
    expect(tokenMatches(undefined, CODE)).toBe(false);
  });
});

describe("入口の判断", () => {
  const base = { code: CODE, pathname: "/", method: "GET", token: undefined };

  it("合言葉の設定がなければ、今までどおり通す", () => {
    expect(decideGate({ ...base, code: null })).toBe("pass");
    expect(decideGate({ ...base, code: null, pathname: "/api/converse", method: "POST" })).toBe("pass");
  });

  it("未入力ならページは入力画面へ、API と送信は止める", () => {
    expect(decideGate(base)).toBe("to_access");
    expect(decideGate({ ...base, pathname: "/_next/static/a.js" })).toBe("to_access");
    expect(decideGate({ ...base, pathname: "/api/inbox" })).toBe("unauthorized");
    expect(decideGate({ ...base, pathname: "/api/converse", method: "POST" })).toBe("unauthorized");
    expect(decideGate({ ...base, method: "POST" })).toBe("unauthorized");
  });

  it("入力画面と起動の確認だけは開ける", () => {
    expect(decideGate({ ...base, pathname: "/access" })).toBe("pass");
    expect(decideGate({ ...base, pathname: "/api/health" })).toBe("pass");
    expect(decideGate({ ...base, pathname: "/api/health/x" })).toBe("unauthorized");
  });

  it("ホーム画面に追加する設定とアイコンは、合言葉なしで読める（道が完全に同じときだけ）", () => {
    for (const pathname of ["/manifest.webmanifest", "/icon1", "/apple-icon"]) {
      expect(decideGate({ ...base, pathname })).toBe("pass");
    }
    expect(decideGate({ ...base, pathname: "/icon1/x" })).toBe("to_access");
    expect(decideGate({ ...base, pathname: "/apple-icon.png" })).toBe("to_access");  });

  it("正しい cookie なら通し、違えば通さない", () => {
    expect(decideGate({ ...base, token: accessToken(CODE) })).toBe("pass");
    expect(decideGate({ ...base, token: CODE })).toBe("to_access");
  });
});
