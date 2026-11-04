import { describe, expect, it } from "vitest";
import { PIXEL_FORMS, PIXEL_SIZE, pixelSprite, pixelStageFor, spriteRects, type PixelForms, type Sprite } from "./pixel-companion";

const blank: Sprite = Array.from({ length: PIXEL_SIZE }, () => ".".repeat(PIXEL_SIZE));

describe("レトロの相棒", () => {
  const all: [string, Sprite][] = [
    ["たまご", PIXEL_FORMS.egg],
    ["こども", PIXEL_FORMS.child],
    ...Object.entries(PIXEL_FORMS.adult).map(([name, sprite]): [string, Sprite] => [`おとな ${name}`, sprite]),
  ];

  it.each(all)("%s は 24×24 で、決まった色だけを使う", (_name, sprite) => {
    expect(sprite).toHaveLength(PIXEL_SIZE);
    for (const row of sprite) expect(row).toMatch(/^[.#+o]{24}$/);
  });

  it("今の育ちを3段階に分ける", () => {
    expect(pixelStageFor(null, 0)).toBe("egg");
    expect(pixelStageFor("bird", 0)).toBe("egg");
    expect(pixelStageFor("bird", 1)).toBe("child");
    expect(pixelStageFor("bird", 2)).toBe("child");
    expect(pixelStageFor("bird", 3)).toBe("adult");
    expect(pixelStageFor("jacket", 4)).toBe("adult");
  });

  it("おとなの分岐は表に足せて、ないものは決まった姿になる", () => {
    const forms: PixelForms = { ...PIXEL_FORMS, adult: { default: PIXEL_FORMS.adult.default, bird: blank } };
    expect(pixelSprite("adult", "bird", forms)).toBe(blank);
    expect(pixelSprite("adult", "dragon", forms)).toBe(PIXEL_FORMS.adult.default);
    expect(pixelSprite("adult", "constructor", forms)).toBe(PIXEL_FORMS.adult.default);
    expect(pixelSprite("adult", null, forms)).toBe(PIXEL_FORMS.adult.default);
    expect(pixelSprite("egg", "bird", forms)).toBe(PIXEL_FORMS.egg);
  });

  it("透明の点は描かず、続く点は1つにまとめる", () => {
    expect(spriteRects(["..##+."])).toEqual([
      { x: 2, y: 0, width: 2, tone: "#" },
      { x: 4, y: 0, width: 1, tone: "+" },
    ]);
  });
});
