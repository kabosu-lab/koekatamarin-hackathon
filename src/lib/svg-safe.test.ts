import { describe, expect, it } from "vitest";
import { sanitizeSvgFragment } from "./svg-safe";

describe("sanitizeSvgFragment", () => {
  it("図形と色だけの断片は通す", () => {
    const fragment = `<defs><linearGradient id="a"><stop offset="0" stop-color="#fff"/></linearGradient></defs><g transform="translate(1 2)"><circle cx="1" cy="2" r="3" fill="url(#a)"/><line x1="1" y1="2" x2="3" y2="4" stroke="#000"/></g>`;
    expect(sanitizeSvgFragment(fragment)).toBe(fragment);
  });

  it.each([
    ["script", `<script>alert(1)</script>`],
    ["イベント", `<circle r="1" onload="alert(1)"/>`],
    ["大文字のイベント", `<circle r="1" ONCLICK="alert(1)"/>`],
    ["外部への参照", `<use href="http://example.com/a.svg#b"/>`],
    ["xlink", `<g xlink:href="#a"/>`],
    ["foreignObject", `<foreignObject><div/></foreignObject>`],
    ["文字", `<g>こんにちは</g>`],
    ["text 要素", `<text>hi</text>`],
    ["画像", `<image href="a.png"/>`],
    ["style 属性", `<circle style="fill:red"/>`],
    ["外部の url", `<circle fill="url(http://example.com/x)"/>`],
    ["javascript", `<circle fill="javascript:alert(1)"/>`],
    ["実体参照", `<circle fill="&#106;"/>`],
    ["コメント", `<!-- x --><circle r="1"/>`],
    ["svg で包む", `<svg><circle r="1"/></svg>`],
    ["閉じていない", `<g><circle r="1"/>`],
    ["閉じ方が違う", `<g></path>`],
    ["一重引用符", `<circle r='1'/>`],
  ])("%s を捨てる", (_name, fragment) => {
    expect(sanitizeSvgFragment(fragment)).toBeNull();
  });

  it("文字列でないものと、大きすぎるものを捨てる", () => {
    expect(sanitizeSvgFragment(null)).toBeNull();
    expect(sanitizeSvgFragment(`<circle r="1"/>`.repeat(2000))).toBeNull();
    expect(sanitizeSvgFragment(`<circle r="1"/>`.repeat(201))).toBeNull();
  });
});
