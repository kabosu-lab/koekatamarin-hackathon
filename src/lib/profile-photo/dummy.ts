import { deflateSync } from "node:zlib";
import type { ProfilePhotoSource } from "./types";

type Color = [number, number, number];
const SIZE = 256;

/** ダミーの写真をコードで描く。実在の写真も、素材のファイルも使わない。 */
class Canvas {
  private pixels = new Uint8Array(SIZE * SIZE * 3);

  constructor(background: Color) {
    this.fill(() => true, background);
  }

  fill(inside: (x: number, y: number) => boolean, color: Color) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (inside(x, y)) this.pixels.set(color, (y * SIZE + x) * 3);
      }
    }
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: Color) {
    this.fill((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, color);
  }

  circle(cx: number, cy: number, r: number, color: Color) {
    this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2, color);
  }

  /** 上の幅と下の幅が違う四角（カップの形） */
  taper(top: number, bottom: number, topHalf: number, bottomHalf: number, color: Color) {
    this.fill((x, y) => {
      if (y < top || y >= bottom) return false;
      const half = topHalf + ((bottomHalf - topHalf) * (y - top)) / (bottom - top);
      return Math.abs(x - SIZE / 2) <= half;
    }, color);
  }

  toPng(): Uint8Array {
    const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
      const start = y * (SIZE * 3 + 1);
      raw[start] = 0;
      raw.set(this.pixels.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), start + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header.set([8, 2, 0, 0, 0], 8);
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** フラペチーノ風の飲み物。クリームとストローがある。 */
export function drawFrappe(): Uint8Array {
  const canvas = new Canvas([214, 239, 226]);
  canvas.rect(150, 18, 162, 110, [46, 125, 90]);
  canvas.circle(128, 96, 44, [255, 250, 240]);
  canvas.circle(100, 106, 28, [255, 250, 240]);
  canvas.circle(156, 106, 28, [255, 250, 240]);
  canvas.rect(70, 112, 186, 124, [120, 72, 40]);
  canvas.taper(124, 236, 56, 38, [176, 122, 80]);
  canvas.taper(160, 196, 50, 45, [46, 125, 90]);
  return canvas.toPng();
}

/** ノートパソコン風の銀色の機械。 */
export function drawLaptop(): Uint8Array {
  const canvas = new Canvas([236, 232, 244]);
  canvas.rect(46, 52, 210, 166, [176, 180, 190]);
  canvas.rect(56, 62, 200, 156, [24, 32, 64]);
  canvas.circle(128, 108, 26, [120, 150, 255]);
  canvas.rect(28, 166, 228, 186, [200, 204, 212]);
  canvas.rect(108, 166, 148, 174, [150, 154, 164]);
  return canvas.toPng();
}

const PHOTOS: Record<string, () => Uint8Array> = {
  saeki: drawFrappe,
  kawamura: drawLaptop,
  aoki: drawFrappe,
};

/** 提出版の「Teams の写真」。写真を登録していない人もいる。 */
export function createDummyPhotos(): ProfilePhotoSource {
  return {
    label: "Teams の写真（ダミー）",
    async getPhoto(personId) {
      const draw = PHOTOS[personId];
      return draw ? { mediaType: "image/png", bytes: draw() } : null;
    },
  };
}
