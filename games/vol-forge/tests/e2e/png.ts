import { inflateSync } from 'node:zlib';

export interface Pixels {
  readonly width: number;
  readonly height: number;
  /** Satır sırasıyla RGBA, piksel başına 4 bayt. */
  readonly data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Playwright ekran görüntüsünü çözer: 8 bit RGB/RGBA, ağsız (non-interlaced) PNG. Başka biçimde hata
 * fırlatır; test yalnız küçük kırpmaların piksel renginden emin olmak içindir.
 */
export function decodePng(bytes: Uint8Array): Pixels {
  if (SIGNATURE.some((value, index) => bytes[index] !== value)) throw new Error('PNG değil.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const parts: Uint8Array[] = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const depth = body[8];
      const color = body[9];
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0)
        throw new Error(`Desteklenmeyen PNG: derinlik ${depth}, renk ${color}.`);
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') parts.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const row = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : paeth(left, up, upLeft);
      row[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = row[x * channels];
      out[(y * width + x) * 4 + 1] = row[x * channels + 1];
      out[(y * width + x) * 4 + 2] = row[x * channels + 2];
      out[(y * width + x) * 4 + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    previous.set(row);
  }
  return { width, height, data: out };
}

/** Piksellerin ortalama rengi. */
export function averageColor(pixels: Pixels): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  const count = pixels.width * pixels.height;
  for (let index = 0; index < count; index++) {
    r += pixels.data[index * 4];
    g += pixels.data[index * 4 + 1];
    b += pixels.data[index * 4 + 2];
  }
  return { r: r / count, g: g / count, b: b / count };
}
