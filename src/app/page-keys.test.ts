import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 本番のビルドでは React が key の重複を知らせないので、ソースで確かめる
describe("最初の画面の key", () => {
  it("リボンの知らせと話す画面は、同じ key の兄弟にしない", () => {
    const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
    const ribbon = source.match(/<RibbonMoment key=\{([^}]*\}?[^}]*)\}/)?.[1];
    const talk = source.match(/<Talk\s+key=\{([^}]*)\}/)?.[1];
    expect(ribbon).toContain("ribbon-");
    expect(talk).toBe("viewer.id");
  });
});
