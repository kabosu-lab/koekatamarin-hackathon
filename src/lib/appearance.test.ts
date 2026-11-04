import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAppearanceValue, readAppearance } from "./appearance";

const css = readFileSync("src/app/globals.css", "utf-8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [":root", 'html[data-theme="game"]', 'html[data-theme="clear"]'];

describe("きせかえ", () => {
  it.each(THEMES)("%s は文字が読みやすい（AA の 4.5 以上）", (selector) => {
    const t = tokens(selector);
    const pairs: [string, string][] = [
      ["ink", "ground"],
      ["ink", "surface"],
      ["ink", "soft"],
      ["ink", "bubble-user"],
      ["ink", "warn"],
      ["ink", "good"],
      ["ink", "danger"],
      ["ink", "thanks"],
      ["muted", "surface"],
      ["muted", "ground"],
      ["on-accent", "accent"],
      ["accent", "surface"],
      ["accent", "ground"],
    ];
    for (const [fore, back] of pairs) {
      expect(contrast(t[fore], t[back]), `${fore} / ${back}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("「くっきり」は、ふだんより文字がはっきりしている", () => {
    expect(contrast(tokens('html[data-theme="clear"]').ink, tokens('html[data-theme="clear"]').ground)).toBeGreaterThan(
      contrast(tokens(":root").ink, tokens(":root").ground),
    );
  });

  it("きせかえでは色と書体しか変えない（CSS の変数だけ）", () => {
    for (const selector of THEMES.slice(1)) {
      const start = css.indexOf(`${selector} {`);
      const block = css.slice(start + selector.length + 2, css.indexOf("}", start));
      for (const line of block.split("\n").map((l) => l.trim()).filter(Boolean)) {
        expect(line.startsWith("--"), line).toBe(true);
      }
    }
  });
});

describe("設定の読み取り", () => {
  it("初めはモダン、ふつうの大きさ、音なし", () => {
    expect(readAppearance(() => undefined)).toEqual({ theme: "modern", size: "normal", sound: "on" });
  });

  it("おかしな値は使わない", () => {
    expect(readAppearance(() => '"><script>')).toEqual({ theme: "modern", size: "normal", sound: "on" });
    expect(isAppearanceValue("theme", "game")).toBe(true);
    expect(isAppearanceValue("theme", "evil")).toBe(false);
    expect(isAppearanceValue("evil", "game")).toBe(false);
  });
});
