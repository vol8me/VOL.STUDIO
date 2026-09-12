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
  private readonly mask: number;
  private readonly scratch: Float32Array;

  constructor(readonly resolution: number) {
    if (resolution < 2 || !Number.isInteger(resolution) || (resolution & (resolution - 1)) !== 0) {
      throw new RangeError(`FieldSet çözünürlüğü ikinin kuvveti olmalı: ${resolution}`);
    }
    this.length = resolution * resolution;
    this.mask = resolution - 1;
    this.flowX = new Float32Array(this.length);
    this.flowY = new Float32Array(this.length);
    this.nutrient = new Float32Array(this.length);
    this.light = new Float32Array(this.length);
    this.temperature = new Float32Array(this.length);
    this.disturbance = new Float32Array(this.length);
    this.scratch = new Float32Array(this.length);
  }

  names(): readonly FieldName[] {
    return FIELD_NAMES;
  }

  get(name: FieldName): Float32Array {
    return this[name];
  }

  index(x: number, y: number): number {
    return ((y & this.mask) * this.resolution + (x & this.mask)) | 0;
  }

  sample(name: FieldName, worldX: number, worldY: number, worldSize: number): number {
    const gridX = (wrap(worldX, worldSize) / worldSize) * this.resolution - 0.5;
    const gridY = (wrap(worldY, worldSize) / worldSize) * this.resolution - 0.5;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = gridX - x0;
    const ty = gridY - y0;
    const field = this[name];
    const top = mix(field[this.index(x0, y0)], field[this.index(x0 + 1, y0)], tx);
    const bottom = mix(field[this.index(x0, y0 + 1)], field[this.index(x0 + 1, y0 + 1)], tx);
    return mix(top, bottom, ty);
  }

  diffuse(name: FieldName, amount: number): void {
    this.diffuseRows(name, amount, 0, this.resolution);
  }

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
    const centerWeight = 1 - amount * 4;
    const endRow = startRow + rowCount;
    for (let y = startRow; y < endRow; y++) {
      for (let x = 0; x < this.resolution; x++) {
        const index = this.index(x, y);
        this.scratch[index] =
          readSource[index] * centerWeight +
          (readSource[this.index(x - 1, y)] +
            readSource[this.index(x + 1, y)] +
            readSource[this.index(x, y - 1)] +
            readSource[this.index(x, y + 1)]) *
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
    for (const name of FIELD_NAMES) {
      if (snapshot[name].length !== this.length) {
        throw new RangeError(`${name} alanı ${this.length} değer taşımalı`);
      }
      this[name].set(snapshot[name]);
    }
  }
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}
