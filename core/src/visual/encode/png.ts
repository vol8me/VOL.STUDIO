/**
 * PNG kodlayıcı — §6. **Node-only alt-yol; barrel'a girmez (D8).**
 *
 * `@volstudio/core/visual` tarayıcı paketine `node:zlib`/`node:fs` sızmasın
 * diye ayrı bir giriş noktasıdır; ses tarafındaki
 * `@volstudio/core/audio/synth/writer` deseninin birebir aynısı.
 *
 * **Neden ffmpeg değil:** ses OGG için ffmpeg'e mecburdur (Vorbis kodlayıcı
 * yazmak makul değil). PNG öyle değil: `node:zlib` yerleşiktir ve konteyner
 * basittir. Görsel hattın bir dış ikiliye bağlı olmaması gerçek bir
 * kazançtır — ortam kontrolünde bir önkoşul daha olmaz.
 *
 * **Determinizm (D5) hakkında dürüst sınır:** aynı belge + aynı tohum aynı
 * PİKSELLERİ verir ve test bunu doğrular. Bayt düzeyinde aynı DOSYA ise
 * zlib'in sıkıştırma çıktısının aynı kalmasına bağlıdır; bu, aynı Node
 * sürümünde geçerlidir ama sürümler arası garanti edilemez. Garanti edilen
 * sözleşme piksel özdeşliğidir, dosya boyutu değil.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** İndeksli PNG'nin taşıyabileceği azami palet girdisi. */
const MAX_INDEXED_ENTRIES = 256;

const COLOR_TYPE_INDEXED = 3;
const COLOR_TYPE_RGBA = 6;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function ihdr(width: number, height: number, colorType: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // bit derinliği
  data[9] = colorType;
  data[10] = 0; // sıkıştırma: deflate
  data[11] = 0; // filtre yöntemi: uyarlanabilir
  data[12] = 0; // interlace yok
  return chunk('IHDR', data);
}

interface IndexedImage {
  /** Piksel başına palet indeksi. */
  readonly indices: Uint8Array;
  /** `[r,g,b, …]` palet baytları. */
  readonly plte: Buffer;
  /** Palet girdisi başına alfa; hepsi opaksa boş. */
  readonly trns: Buffer;
}

/**
 * Görüntüyü indekslemeye çalışır; ayrık (renk, alfa) çifti 256'yı aşarsa
 * `null` döner ve çağıran truecolor'a düşer (§6).
 *
 * Palet sırası piksel sırasına göre İLK GÖRÜLME sırasıdır — deterministiktir
 * ve ayrıca sıralama maliyeti getirmez.
 */
function buildIndexed(rgba: Uint8ClampedArray, pixelCount: number): IndexedImage | null {
  const indices = new Uint8Array(pixelCount);
  const lookup = new Map<number, number>();
  const entries: number[] = [];

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const key =
      ((rgba[offset] << 24) |
        (rgba[offset + 1] << 16) |
        (rgba[offset + 2] << 8) |
        rgba[offset + 3]) >>>
      0;
    let index = lookup.get(key);
    if (index === undefined) {
      if (entries.length >= MAX_INDEXED_ENTRIES) return null;
      index = entries.length;
      entries.push(key);
      lookup.set(key, index);
    }
    indices[i] = index;
  }

  const plte = Buffer.alloc(entries.length * 3);
  const alphas = Buffer.alloc(entries.length);
  entries.forEach((key, i) => {
    plte[i * 3] = (key >>> 24) & 0xff;
    plte[i * 3 + 1] = (key >>> 16) & 0xff;
    plte[i * 3 + 2] = (key >>> 8) & 0xff;
    alphas[i] = key & 0xff;
  });

  // tRNS yalnızca son saydam girdiye kadar yazılır; sonrası opak varsayılır.
  let lastTransparent = -1;
  for (let i = 0; i < alphas.length; i++) if (alphas[i] !== 255) lastTransparent = i;
  const trns = lastTransparent < 0 ? Buffer.alloc(0) : alphas.subarray(0, lastTransparent + 1);

  return { indices, plte, trns };
}

/**
 * Satırları PNG'nin beklediği biçime alır: her satırın başına filtre baytı.
 *
 * Filtre 0 (None) kullanılır. Uyarlanabilir filtreleme dosyayı küçültürdü
 * ama çıktının belirlenimi filtre seçim sezgiselliğine bağlanırdı; palet
 * sınırlı bir sprite zaten küçüktür ve dosya boyutu bu hattın kısıtı değil.
 */
function filterScanlines(
  source: Uint8Array,
  width: number,
  height: number,
  stride: number,
): Buffer {
  const raw = Buffer.alloc(height * (1 + width * stride));
  for (let y = 0; y < height; y++) {
    const target = y * (1 + width * stride);
    raw[target] = 0;
    for (let x = 0; x < width * stride; x++) raw[target + 1 + x] = source[y * width * stride + x];
  }
  return raw;
}

/**
 * RGBA tamponunu PNG'ye kodlar.
 *
 * Varsayılan indekslidir: dosyayı ciddi küçültür ve palet kilidini (D6)
 * dosya formatının kendisinde de garanti eder — indeksli bir PNG palet
 * dışı bir renk TAŞIYAMAZ.
 */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PNG: boyut pozitif tam sayı olmalı (gelen: ${width}x${height})`);
  }
  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) {
    throw new Error(`PNG: tampon ${pixelCount * 4} bayt olmalı (gelen: ${rgba.length})`);
  }

  const indexed = buildIndexed(rgba, pixelCount);
  const parts: Buffer[] = [PNG_SIGNATURE];

  if (indexed) {
    parts.push(ihdr(width, height, COLOR_TYPE_INDEXED));
    parts.push(chunk('PLTE', indexed.plte));
    if (indexed.trns.length > 0) parts.push(chunk('tRNS', indexed.trns));
    parts.push(chunk('IDAT', deflateSync(filterScanlines(indexed.indices, width, height, 1))));
  } else {
    parts.push(ihdr(width, height, COLOR_TYPE_RGBA));
    const bytes = new Uint8Array(rgba.length);
    bytes.set(rgba);
    parts.push(chunk('IDAT', deflateSync(filterScanlines(bytes, width, height, 4))));
  }

  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** PNG'yi diske yazar; ara klasörler oluşturulur. */
export function writePng(
  filePath: string,
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, encodePng(width, height, rgba));
}
