/**
 * ホイールをなぞって機能を選ぶ「チップのカルーセル」の計算（0-1g(3)、設計書 §2-1-C）。
 * 画面に関係しない純粋な計算だけを置く。位置 pos の単位は「枚」（24度で1枚）。
 */

/** 1枚ぶんの角度。ClickWheel の刻みと同じ */
export const TICK_DEGREES = 24;
/** この角度より手前で離したら、なぞりに入らない（何も起きない） */
export const START_DEGREES = 12;
/** 同時に描くチップの枚数（真ん中 ±2） */
export const VISIBLE = 5;
/** 真ん中への吸い付きの強さ（刻みの手前で重く、越えると軽い） */
export const DETENT = 0.18;
/** 離したときに、これより遅ければその場で吸い付く（枚/ms） */
export const FLING_MIN = 0.004;
/** 慣性で進むのは最大この枚数まで */
export const FLING_MAX = 4;
/** 1コマに鳴らすカリの上限 */
export const MAX_CLICKS_PER_FRAME = 3;
/** 真ん中のチップの大きさ（0-2o(1)：ほかより、はっきり大きく） */
export const CENTER_SCALE = 1.16;
/** 輪の外とみなす半径の倍率 */
export const CANCEL_RADIUS = 1.15;

export type ChipLayout = {
  /** 横のずれ（px） */
  x: number;
  /** 下への沈み（px）。ゆるい弧 */
  y: number;
  scale: number;
  /** 傾き（度） */
  rotate: number;
  opacity: number;
  /** 真ん中の1枚（光らせる） */
  center: boolean;
};

/** 輪でつながった項目の番号。負の数でも 0〜n-1 に戻す */
export function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((Math.round(i) % n) + n) % n;
}

/** 真ん中からのずれ k（枚、小数）から、チップの置き方を決める */
export function layoutOf(k: number): ChipLayout {
  const a = Math.abs(k);
  const near = Math.min(a, 2);
  // 2枚より外は、2.5枚で見えなくなるまで薄くする（そこで中身を入れ替えても見えない）
  const edge = a <= 2 ? 1 : Math.max(0, (2.5 - a) / 0.5);
  // 0-2o(1)：真ん中をはっきり大きく、隣から先は小さく薄く（隣までで大きく下がり、その外はゆるやかに）
  const inner = Math.min(near, 1);
  const outer = near - inner;
  return {
    x: k * 96,
    y: 10 * k * k,
    scale: CENTER_SCALE - 0.44 * inner - 0.14 * outer,
    rotate: -4 * k,
    // 両わきは透かさない（後ろの会話が透けて重なるため）。薄く見せるのは CSS で色を落として行う。
    // 見えない端（2〜2.5枚）でだけ消し、中身の差し替えを見せない
    opacity: edge,
    center: a < 0.5,
  };
}

/** 指に付いて動く位置に、刻みへの吸い付きを少し足す */
export function shownPos(pos: number): number {
  return pos + DETENT * (Math.round(pos) - pos);
}

/**
 * 離したときに止まる位置。v は枚/ms。
 * 遅ければその場の最寄り、速ければ滑って止まる予測位置の最寄り（最大 FLING_MAX 枚まで）。
 */
export function snapTarget(pos: number, v: number): number {
  const here = Math.round(pos);
  if (!Number.isFinite(v) || Math.abs(v) < FLING_MIN) return here;
  // 1コマ 16ms ごとに 0.92 倍で減る滑りが、止まるまでに進む距離
  const glide = (v * 16) / (1 - 0.92);
  const target = Math.round(pos + glide);
  return Math.max(here - FLING_MAX, Math.min(here + FLING_MAX, target));
}

/** 表示の位置が刻みをいくつ越えたか（カリを鳴らす数。1コマ最大3回） */
export function clicksBetween(before: number, after: number): number {
  return Math.min(Math.abs(Math.round(after) - Math.round(before)), MAX_CLICKS_PER_FRAME);
}

/**
 * 5枚の DOM のうち slot 番目（0〜4）のチップが、いま輪の何番目（整数、輪に戻す前）を表すか。
 * slot は番号を 5 で割った余りに固定するので、同じ DOM が流れ続け、入れ替えは見えない端でだけ起きる。
 */
export function slotTarget(slot: number, pos: number): number {
  const base = Math.round(pos);
  // base-2 〜 base+2 のうち、5で割った余りが slot のもの
  const offset = (((slot - (base - 2)) % VISIBLE) + VISIBLE) % VISIBLE;
  return base - 2 + offset;
}

/** ばね（stiffness 320 / damping 28、質量 1）を dt 秒だけ進める。行き過ぎは1回わずか */
export function springStep(x: number, v: number, target: number, dt: number): { x: number; v: number } {
  const stiffness = 320;
  const damping = 28;
  // 大きなコマ落ちでも暴れないよう、細かく刻んで進める
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = -stiffness * (x - target) - damping * v;
    v += a * h;
    x += v * h;
  }
  return { x, v };
}

/** ばねが止まったとみなせるか */
export function springSettled(x: number, v: number, target: number): boolean {
  return Math.abs(x - target) < 0.002 && Math.abs(v) < 0.01;
}

/**
 * 指を離した場所で、やめるかどうか。dx, dy は輪の中心からの距離（px）。
 * 輪の外（半径の 1.15 倍より外）か、真ん中のマイクの上ならやめる。
 */
export function isCancelPoint(dx: number, dy: number, wheelRadius: number, micRadius: number): boolean {
  const r = Math.hypot(dx, dy);
  return r > wheelRadius * CANCEL_RADIUS || r < micRadius;
}
