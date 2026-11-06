import { describe, expect, it } from "vitest";
import { columnSrc, isColumnPath, wideBootScript, wideHomeUrl, wideSide } from "./wide";

describe("wideSide", () => {
  it("履歴と設定の奥は左、みんなの奥は右、話す画面は真ん中", () => {
    expect(wideSide("/")).toBeNull();
    expect(wideSide("/me")).toBe("left");
    expect(wideSide("/daily")).toBe("left");
    expect(wideSide("/lookback")).toBe("left");
    expect(wideSide("/yousu")).toBe("left");
    expect(wideSide("/minna")).toBe("right");
    expect(wideSide("/inbox")).toBe("right");
    expect(wideSide("/chie/abc")).toBe("right");
    expect(wideSide("/study/room")).toBe("right");
    // 前の文字が同じでも、別の画面は取り違えない
    expect(wideSide("/meet")).toBe("right");
  });
});

describe("wideHomeUrl と columnSrc", () => {
  it("奥の画面は、ホームの3列のその列の中に開く", () => {
    expect(wideHomeUrl("/inbox")).toBe("/?right=%2Finbox");
    expect(wideHomeUrl("/me?open=daily")).toBe("/?left=%2Fme%3Fopen%3Ddaily");
    expect(wideHomeUrl("/")).toBe("/");
  });

  it("列の中身は同じサイトの、その列の画面だけ。ほかは初めの画面", () => {
    expect(columnSrc("left", "/me?open=thanks")).toBe("/me?open=thanks");
    expect(columnSrc("right", "/chie")).toBe("/chie");
    expect(columnSrc("left", "/inbox")).toBe("/me");
    expect(columnSrc("right", "//evil.example")).toBe("/minna");
    expect(columnSrc("right", "https://evil.example")).toBe("/minna");
    expect(columnSrc("right", "/")).toBe("/minna");
    expect(columnSrc("right", undefined)).toBe("/minna");
    expect(isColumnPath("/api/health")).toBe(false);
  });

  it("描く前のスクリプトは、同じメディアクエリを使う", () => {
    expect(wideBootScript()).toContain("(min-width: 1024px) and (min-height: 600px)");
  });
});
