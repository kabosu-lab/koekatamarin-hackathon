/**
 * Claude が描いた SVG の断片を、許可リストで確かめる。
 * 少しでも外れたものは直さずに丸ごと捨てる（呼ぶ側がコードで描いた絵に戻す）。
 * 文字も通さないので、分身が言葉を話すことはない。
 */
const MAX_FRAGMENT_LENGTH = 12_000;
const MAX_ELEMENTS = 200;

const ELEMENTS = new Set([
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
]);

const ATTRIBUTES = new Set([
  "id",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "fx",
  "fy",
  "width",
  "height",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-dasharray",
  "opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "clip-path",
]);

const TAG = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z][a-zA-Z0-9-]*="[^"<>]*")*)\s*(\/?)>/y;
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9-]*)="([^"<>]*)"/g;
/** 値に使える文字。外への参照に要る「:」「/」「&」「\」は通さない。 */
const SAFE_VALUE = /^[a-zA-Z0-9#.,\s()%_+-]*$/;
const SELF_REFERENCE = /^url\(#[a-zA-Z0-9_-]+\)$/;

function isSafeValue(value: string): boolean {
  if (!SAFE_VALUE.test(value)) return false;
  return !/url\s*\(/i.test(value) || SELF_REFERENCE.test(value);
}

/** 安全な断片だけを返す。だめなら null。 */
export function sanitizeSvgFragment(fragment: unknown): string | null {
  if (typeof fragment !== "string" || fragment.length > MAX_FRAGMENT_LENGTH) return null;
  const open: string[] = [];
  let count = 0;
  let position = 0;
  while (position < fragment.length) {
    const space = /\s*/y;
    space.lastIndex = position;
    space.test(fragment);
    position = space.lastIndex;
    if (position >= fragment.length) break;

    TAG.lastIndex = position;
    const match = TAG.exec(fragment);
    if (!match) return null;
    const [whole, closing, name, attributes, selfClosing] = match;
    position += whole.length;
    if (!ELEMENTS.has(name) || ++count > MAX_ELEMENTS) return null;

    if (closing) {
      if (attributes || selfClosing || open.pop() !== name) return null;
      continue;
    }
    for (const [, attribute, value] of attributes.matchAll(ATTRIBUTE)) {
      if (!ATTRIBUTES.has(attribute) || !isSafeValue(value)) return null;
    }
    if (!selfClosing) open.push(name);
  }
  return open.length === 0 ? fragment : null;
}
