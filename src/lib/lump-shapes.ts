/**
 * 声のかたまりの形。アイコンの雰囲気から Claude がこの一覧の中で選ぶ。一覧にない値は捨てる。
 * 先のとがった形にせず、大きな目と口を付けない。形は数字で増やせる。
 */
export type LumpShape = {
  /** 幅、高さ、奥行きの半径 */
  size: [number, number, number];
  /** 表面のうねりの大きさと細かさ */
  wobble: number;
  lobes: number;
  /** 吹き出しのしっぽの長さ。0 ならなく、底を少し平らにする */
  tail: number;
};

export const LUMP_SHAPES = {
  bubble: { size: [1.02, 0.7, 0.84], wobble: 0.02, lobes: 2, tail: 1 },
  drop: { size: [0.84, 0.86, 0.84], wobble: 0.015, lobes: 2, tail: 0 },
  mochi: { size: [0.98, 0.74, 0.92], wobble: 0.025, lobes: 2, tail: 0 },
  fluff: { size: [0.86, 0.82, 0.86], wobble: 0.07, lobes: 5, tail: 0 },
  cloud: { size: [1.08, 0.66, 0.8], wobble: 0.06, lobes: 3, tail: 0 },
  jelly: { size: [0.8, 0.92, 0.8], wobble: 0.03, lobes: 2, tail: 0 },
  pebble: { size: [0.96, 0.6, 0.78], wobble: 0.012, lobes: 1.5, tail: 0 },
} satisfies Record<string, LumpShape>;

export type LumpShapeName = keyof typeof LUMP_SHAPES;
export const LUMP_SHAPE_NAMES = Object.keys(LUMP_SHAPES) as LumpShapeName[];

export function parseLumpShape(value: unknown): LumpShapeName | undefined {
  return LUMP_SHAPE_NAMES.find((name) => name === value);
}
