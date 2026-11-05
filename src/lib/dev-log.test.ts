import { describe, expect, it } from "vitest";
import { countsFromOutput, devLogMessage } from "./dev-log";

describe("開発の足跡", () => {
  it("テストの出力から、単体と画面の件数を拾う", () => {
    const output = " Test Files  50 passed (50)\n      Tests  686 passed (686)\n  ✓ 1 [スマホ] ok\n  208 passed (1.9m)\n";
    expect(countsFromOutput(output)).toEqual({ unit: 686, e2e: 208 });
    expect(countsFromOutput("")).toEqual({ unit: null, e2e: null });
  });

  it("1件の文は件数と最新のコミット1行だけ", () => {
    expect(devLogMessage({ kind: "test", unit: 686, e2e: 208, commit: "abc123 試用版を足す" })).toBe(
      "テストが全部通りました（単体 686件、画面 208件）。いまの最新：abc123 試用版を足す",
    );
    expect(devLogMessage({ kind: "test", unit: null, e2e: null, commit: "" })).toBe("テストが全部通りました。いまの最新：（コミットが読めませんでした）");
    expect(devLogMessage({ kind: "push", unit: null, e2e: null, commit: "abc123 直す\n\n本文" })).toBe("push しました：abc123 直す 本文");
  });
});
