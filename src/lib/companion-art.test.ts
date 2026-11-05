import { describe, expect, it } from "vitest";
import { CATALOG } from "./avatar-catalog";
import { COMPANION_FAMILIES, companionColor, companionImage, companionSvg } from "./companion-art";

describe("相棒の絵", () => {
  it("一覧のどの系統にも絵があり、動物は14種ある", () => {
    for (const entry of CATALOG) expect(companionSvg(entry.id, 2), entry.id).toContain("<svg");
    expect(COMPANION_FAMILIES).toHaveLength(14);
  });

  it("知らない系統は描かない。文字列を絵に混ぜない", () => {
    expect(companionSvg("<script>", 2)).toBeNull();
    expect(companionSvg("constructor", 2)).toBeNull();
  });

  it("段階1までは声のかたまり（同じ形で色が違う）で、育つと動物になる", () => {
    const lumpOf = (family: string) => companionSvg(family, 1)!;
    expect(lumpOf("bee")).not.toBe(lumpOf("cloud"));
    expect(lumpOf("bee").replace(companionColor("bee"), "")).toBe(lumpOf("cloud").replace(companionColor("cloud"), ""));
    expect(companionSvg("bee", 2)).not.toBe(lumpOf("bee"));
  });

  it("画面が外の絵に頼らない", () => {
    for (const family of COMPANION_FAMILIES) {
      expect(companionSvg(family, 5)).not.toMatch(/href|url\(|<image|<script/);
    }
    expect(companionImage("bee", 2)).toBe("/api/companion/bee-2");
    expect(companionColor(null)).toMatch(/^#/);
  });
});
