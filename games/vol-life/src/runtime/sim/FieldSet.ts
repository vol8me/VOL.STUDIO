import type { Rect } from '@volstudio/core/math/geometry';

export const FIELD_NAMES = [
  'flowX',
  'flowY',
  'nutrient',
  'light',
  'temperature',
  'disturbance',
] as const;

export type FieldName = (typeof FIELD_NAMES)[number];

export type FieldSnapshot = { readonly [K in FieldName]: Float32Array };

export class FieldSet {
  readonly length: number;
  readonly flowX: Float32Array;
  readonly flowY: Float32Array;
  readonly nutrient: Float32Array;
  readonly light: Float32Array;
  readonly temperature: Float32Array;
  readonly disturbance: Float32Array;
  private readonly scratch: Float32Array;
  private habitatMask: Uint8Array | null = null;

  constructor(readonly resolution: number) {
    if (resolution < 2 || !Number.isInteger(resolution) || (resolution & (resolution - 1)) !== 0) {
      throw new RangeError(`FieldSet çözünürlüğü ikinin kuvveti olmalı: ${resolution}`);
    }
    this.length = resolution * resolution;
    this.flowX = new Float32Array(this.length);
    this.flowY = new Float32Array(this.length);
    this.nutrient = new Float32Array(this.length);
    this.light = new Float32Array(this.length);
    this.temperature = new Float32Array(this.length);
    this.disturbance = new Float32Array(this.length);
    this.scratch = new Float32Array(this.length);
  }

  /** Habitat maskesi: 1 habitat hücresi, 0 Void. Void hücresi kaynak üretmez ve difüzyona girmez. */
  get mask(): Uint8Array | null {
    return this.habitatMask;
  }

  setMask(mask: Uint8Array | null): void {
    if (mask && mask.length !== this.length) {
      throw new RangeError(`Habitat maskesi ${this.length} hücre taşımalı: ${mask.length}`);
    }
    if (mask && !mask.every((value) => value === 0 || value === 1)) {
      throw new RangeError('Habitat maskesi yalnız 0/1 taşır.');
    }
    this.habitatMask = mask ? mask.slice() : null;
    if (this.habitatMask) this.applyMaskToFields();
  }

  names(): readonly FieldName[] {
    return FIELD_NAMES;
  }

  get(name: FieldName): Float32Array {
    return this[name];
  }

  index(x: number, y: number): number {
    const clampedX = Math.max(0, Math.min(this.resolution - 1, x));
    const clampedY = Math.max(0, Math.min(this.resolution - 1, y));
    return (clampedY * this.resolution + clampedX) | 0;
  }

  /**
   * MASKE FARKINDA çift doğrusal örnekleme (DESIGN.md §2). Void hücresi kaynak
   * taşımaz; ağırlığa katılırsa kıyıdaki her örnek yapay olarak düşer. Kural:
   * Void ağırlıkları düşülür ve kalan ağırlıklar yeniden normalize edilir; dört
   * hücre de habitatsa sonuç maskesiz bilineer yolla BAYT DÜZEYİNDE aynıdır;
   * dört hücre de Void ise 2×2 şablonu çevreleyen tek hücrelik halkadaki en
   * yakın habitat hücresi deterministik sırayla okunur, o da yoksa 0 döner.
   */
  sample(name: FieldName, worldX: number, worldY: number, bounds: Readonly<Rect>): number {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
      throw new RangeError(`Alan örneklemesi sonlu koordinat ister: (${worldX}, ${worldY})`);
    }
    const normalizedX = clamp01((worldX - bounds.x) / bounds.width);
    const normalizedY = clamp01((worldY - bounds.y) / bounds.height);
    const gridX = normalizedX * this.resolution - 0.5;
    const gridY = normalizedY * this.resolution - 0.5;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = gridX - x0;
    const ty = gridY - y0;
    const field = this[name];
    const mask = this.habitatMask;
    const index00 = this.index(x0, y0);
    const index10 = this.index(x0 + 1, y0);
    const index01 = this.index(x0, y0 + 1);
    const index11 = this.index(x0 + 1, y0 + 1);
    if (
      !mask ||
      (mask[index00] === 1 && mask[index10] === 1 && mask[index01] === 1 && mask[index11] === 1)
    ) {
      const top = mix(field[index00], field[index10], tx);
      const bottom = mix(field[index01], field[index11], tx);
      return mix(top, bottom, ty);
    }
    return this.maskedSample(field, mask, index00, index10, index01, index11, tx, ty, x0, y0);
  }

  private maskedSample(
    field: Float32Array,
    mask: Uint8Array,
    index00: number,
    index10: number,
    index01: number,
    index11: number,
    tx: number,
    ty: number,
    x0: number,
    y0: number,
  ): number {
    let weightSum = 0;
    let base = 0;
    let hasBase = false;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    const indices = [index00, index10, index01, index11];
    const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    for (let corner = 0; corner < 4; corner++) {
      if (mask[indices[corner]] === 0) continue;
      const value = field[indices[corner]];
      if (!hasBase) {
        base = value;
        hasBase = true;
      }
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
      weightSum += weights[corner];
    }
    if (!hasBase) return this.nearestRingValue(field, mask, x0, y0);
    if (weightSum <= 0) return base;
    /*
     * Fark toplamı taban değerin ÜSTÜNE eklenir: sabit bir alanda bütün farklar
     * sıfırdır ve sonuç tam olarak o sabittir. Doğrudan ağırlıklı ortalama
     * float64'te son biti kaydırabilirdi.
     */
    let delta = 0;
    for (let corner = 0; corner < 4; corner++) {
      if (mask[indices[corner]] === 0) continue;
      delta += weights[corner] * (field[indices[corner]] - base);
    }
    const value = base + delta / weightSum;
    return value < minimum ? minimum : value > maximum ? maximum : value;
  }

  /** 2×2 şablonu çevreleyen halka; en yakın habitat hücresi, eşitlikte satır-sütun sırası. */
  private nearestRingValue(field: Float32Array, mask: Uint8Array, x0: number, y0: number): number {
    let bestValue = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let y = y0 - 1; y <= y0 + 2; y++) {
      for (let x = x0 - 1; x <= x0 + 2; x++) {
        const insideTemplate = (x === x0 || x === x0 + 1) && (y === y0 || y === y0 + 1);
        if (insideTemplate) continue;
        if (x < 0 || y < 0 || x >= this.resolution || y >= this.resolution) continue;
        const index = y * this.resolution + x;
        if (mask[index] === 0) continue;
        const distance = (x - (x0 + 0.5)) ** 2 + (y - (y0 + 0.5)) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestValue = field[index];
        }
      }
    }
    return bestValue;
  }

  diffuse(name: FieldName, amount: number): void {
    this.diffuseRows(name, amount, 0, this.resolution);
  }

  /**
   * Habitat–Void yüzeyinde no-flux: maskelenmiş komşu yerine merkez değeri
   * okunur, Void hücresi sıfır kalır. Karşı kenarlar komşu değildir (wrap yok).
   */
  diffuseRows(
    name: FieldName,
    amount: number,
    startRow: number,
    rowCount: number,
    sourceEpoch?: Float32Array,
  ): void {
    if (!(amount >= 0 && amount <= 0.25)) {
      throw new RangeError(`Difüzyon miktarı 0–0,25 aralığında olmalı: ${amount}`);
    }
    if (
      !Number.isInteger(startRow) ||
      !Number.isInteger(rowCount) ||
      startRow < 0 ||
      rowCount < 1 ||
      startRow + rowCount > this.resolution
    ) {
      throw new RangeError(`Difüzyon satır aralığı geçersiz: ${startRow}+${rowCount}`);
    }
    const source = this[name];
    const partial = startRow !== 0 || rowCount !== this.resolution;
    if (partial && (!sourceEpoch || sourceEpoch === source)) {
      throw new Error('Kısmi difüzyon ayrı ve değişmez bir kaynak zamanı gerektirir.');
    }
    if (sourceEpoch && sourceEpoch.length !== this.length) {
      throw new RangeError(`Difüzyon kaynak zamanı ${this.length} değer taşımalı`);
    }
    const readSource = sourceEpoch ?? source;
    const mask = this.habitatMask;
    const centerWeight = 1 - amount * 4;
    const endRow = startRow + rowCount;
    for (let y = startRow; y < endRow; y++) {
      for (let x = 0; x < this.resolution; x++) {
        const index = this.index(x, y);
        if (mask && mask[index] === 0) {
          this.scratch[index] = 0;
          continue;
        }
        const center = readSource[index];
        this.scratch[index] =
          center * centerWeight +
          (this.neighbor(readSource, mask, x - 1, y, center) +
            this.neighbor(readSource, mask, x + 1, y, center) +
            this.neighbor(readSource, mask, x, y - 1, center) +
            this.neighbor(readSource, mask, x, y + 1, center)) *
            amount;
      }
    }
    const start = startRow * this.resolution;
    const end = endRow * this.resolution;
    source.set(this.scratch.subarray(start, end), start);
  }

  snapshot(): FieldSnapshot {
    return Object.fromEntries(
      FIELD_NAMES.map((name) => [name, this[name].slice()]),
    ) as FieldSnapshot;
  }

  restore(snapshot: FieldSnapshot): void {
    const invalid = FIELD_NAMES.find((name) => snapshot[name].length !== this.length);
    if (invalid) {
      throw new RangeError(`${invalid} alanı ${this.length} değer taşımalı`);
    }
    const nonFinite = FIELD_NAMES.find((name) => !snapshot[name].every(Number.isFinite));
    if (nonFinite) {
      throw new RangeError(`${nonFinite} alanı yalnızca sonlu değer taşımalı`);
    }
    for (const name of FIELD_NAMES) this[name].set(snapshot[name]);
  }

  private neighbor(
    source: Float32Array,
    mask: Uint8Array | null,
    x: number,
    y: number,
    center: number,
  ): number {
    const index = this.index(x, y);
    return mask && mask[index] === 0 ? center : source[index];
  }

  private applyMaskToFields(): void {
    const mask = this.habitatMask!;
    for (const name of FIELD_NAMES) {
      const field = this[name];
      for (let index = 0; index < this.length; index++) if (mask[index] === 0) field[index] = 0;
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
