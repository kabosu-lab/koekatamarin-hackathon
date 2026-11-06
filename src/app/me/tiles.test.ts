import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ME_TILE_KEYS, resolveOpenKey } from "./tiles";

describe("履歴と設定のタイル（0-2b）", () => {
  it("6枚で、同じ key は2つない", () => {
    expect(ME_TILE_KEYS).toEqual(["daily", "lookback", "goals", "thanks", "partner", "settings"]);
    expect(new Set(ME_TILE_KEYS).size).toBe(6);
  });

  it("画面のタイルは、この6つの key と同じ順に並ぶ", () => {
    const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");
    const keys = [...source.matchAll(/^ {6}key: "([a-z]+)",$/gm)].map((match) => match[1]);
    expect(keys).toEqual([...ME_TILE_KEYS]);
  });

  it("前の key は新しい行き先へ読み替え、知らない key はタイルの画面に戻す", () => {
    expect(resolveOpenKey("collect")).toBe("partner");
    expect(resolveOpenKey("profile")).toBe("settings");
    expect(resolveOpenKey("trial")).toBe("settings");
    expect(resolveOpenKey("portfolio")).toBe("lookback");
    expect(resolveOpenKey("records")).toBeNull();
    expect(resolveOpenKey("talk")).toBeNull();
    expect(resolveOpenKey("nothing")).toBeNull();
    expect(resolveOpenKey(undefined)).toBeNull();
    expect(resolveOpenKey("goals")).toBe("goals");
  });
});
