/** Küçük-endian, büyüyebilen ikili yazıcı. Ağ paketi ve anlık görüntü aynı sınıfı kullanır. */
export class ByteWriter {
  private buffer: Uint8Array;
  private view: DataView;
  private cursor = 0;

  constructor(initial = 1024) {
    this.buffer = new Uint8Array(Math.max(16, initial));
    this.view = new DataView(this.buffer.buffer);
  }

  get length(): number {
    return this.cursor;
  }

  /** Daha önce yazılmış 4 baytı sonradan doldurur (uzunluk öneki için). */
  patchU32(at: number, value: number): void {
    if (at < 0 || at + 4 > this.cursor) throw new RangeError('Yama yazılmış aralığın dışında.');
    this.view.setUint32(at, value, true);
  }

  /** Yazılanın kopyası; yazıcı yeniden kullanılabilir. */
  finish(): Uint8Array {
    return this.buffer.slice(0, this.cursor);
  }

  reset(): void {
    this.cursor = 0;
  }

  private reserve(bytes: number): void {
    const needed = this.cursor + bytes;
    if (needed <= this.buffer.length) return;
    let size = this.buffer.length;
    while (size < needed) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.cursor));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number): void {
    this.reserve(1);
    this.buffer[this.cursor++] = value;
  }

  u16(value: number): void {
    this.reserve(2);
    this.view.setUint16(this.cursor, value, true);
    this.cursor += 2;
  }

  u32(value: number): void {
    this.reserve(4);
    this.view.setUint32(this.cursor, value, true);
    this.cursor += 4;
  }

  f64(value: number): void {
    this.reserve(8);
    this.view.setFloat64(this.cursor, value, true);
    this.cursor += 8;
  }

  /** Ham bayt bloğu; uzunluk önek yazılmaz. */
  bytes(source: Uint8Array): void {
    this.reserve(source.length);
    this.buffer.set(source, this.cursor);
    this.cursor += source.length;
  }

  /** Tiplenmiş dizinin ham baytlarını yazar (küçük-endian platform varsayımı). */
  typed(source: ArrayBufferView): void {
    this.bytes(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
}

export class ByteReader {
  private readonly view: DataView;
  private cursor = 0;

  constructor(private readonly buffer: Uint8Array) {
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  get remaining(): number {
    return this.buffer.length - this.cursor;
  }

  get position(): number {
    return this.cursor;
  }

  private need(bytes: number): void {
    if (this.cursor + bytes > this.buffer.length) throw new RangeError('Paket beklenenden kısa.');
  }

  u8(): number {
    this.need(1);
    return this.buffer[this.cursor++];
  }

  u16(): number {
    this.need(2);
    const value = this.view.getUint16(this.cursor, true);
    this.cursor += 2;
    return value;
  }

  u32(): number {
    this.need(4);
    const value = this.view.getUint32(this.cursor, true);
    this.cursor += 4;
    return value;
  }

  f64(): number {
    this.need(8);
    const value = this.view.getFloat64(this.cursor, true);
    this.cursor += 8;
    return value;
  }

  /** Verilen uzunlukta ham baytı kopyalamadan görünüm olarak verir. */
  bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0) throw new RangeError('Geçersiz uzunluk.');
    this.need(length);
    const slice = this.buffer.subarray(this.cursor, this.cursor + length);
    this.cursor += length;
    return slice;
  }

  /** Ham baytları hedef tiplenmiş diziye kopyalar; boyut tam eşleşmelidir. */
  typedInto(target: ArrayBufferView): void {
    const raw = new Uint8Array(target.buffer, target.byteOffset, target.byteLength);
    raw.set(this.bytes(raw.length));
  }
}

/** FNV-1a 32 bit; kalıcılık dosyası ve durum karması için. */
export function fnv1a(data: Uint8Array, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < data.length; index++) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Durum karması için hızlı 32 bit karıştırıcı: dört baytı tek adımda işler (FNV'den ~4 kat hızlı).
 * Güvenlik amacı yoktur; iki simülasyonun aynı durumda olup olmadığını denetler.
 */
export function hashBuffer(view: ArrayBufferView, seed: number): number {
  let hash = seed >>> 0;
  if (view.byteOffset % 4 === 0 && view.byteLength % 4 === 0) {
    const words = new Uint32Array(view.buffer, view.byteOffset, view.byteLength / 4);
    for (let index = 0; index < words.length; index++) {
      hash = Math.imul(hash ^ words[index], 0x01000193);
      hash ^= hash >>> 15;
    }
    return hash >>> 0;
  }
  return fnv1a(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), hash);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE); günlük kayıtlarında kesik veya bozuk yazımı yakalar. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index++)
    crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
