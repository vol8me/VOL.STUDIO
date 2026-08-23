import type { RasterSurface, Rgba, SurfaceRect } from './RasterSurface';

export type SelectionOperation = 'replace' | 'add' | 'subtract' | 'intersect';

/**
 * Piksel doğruluğunda seçim maskesi.
 *
 * Maske dikdörtgen DEĞİL bit alanıdır: lasso ve sihirli değnek keyfi biçimler
 * üretir, dikdörtgen bir model bunları temsil edemez. Sınırlayıcı kutu ayrıca
 * tutulur ki transform ve render taramaları bütün belgeyi gezmesin.
 */
export class SelectionModel {
  readonly width: number;
  readonly height: number;
  #mask: Uint8Array;
  #empty = true;
  #bounds: SurfaceRect | null = null;

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#mask = new Uint8Array(width * height);
  }

  public get isEmpty(): boolean {
    return this.#empty;
  }

  /** Seçili alanın sınırlayıcı kutusu; seçim yoksa `null`. */
  public get bounds(): SurfaceRect | null {
    return this.#bounds === null ? null : { ...this.#bounds };
  }

  public contains(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.#mask[y * this.width + x] === 1;
  }

  /** Seçim yoksa BÜTÜN belge düzenlenebilirdir. */
  public isEditable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.#empty || this.#mask[y * this.width + x] === 1;
  }

  public clear(): void {
    this.#mask.fill(0);
    this.#empty = true;
    this.#bounds = null;
  }

  public selectAll(): void {
    this.#mask.fill(1);
    this.#empty = false;
    this.#bounds = { x: 0, y: 0, width: this.width, height: this.height };
  }

  public snapshot(): Uint8Array {
    return new Uint8Array(this.#mask);
  }

  public restore(mask: Uint8Array): void {
    if (mask.length !== this.#mask.length) throw new RangeError('Maske boyutu geçersiz');
    this.#mask.set(mask);
    this.#recompute();
  }

  public applyRect(rect: SurfaceRect, operation: SelectionOperation = 'replace'): void {
    const next = new Uint8Array(this.#mask.length);
    const startX = Math.max(0, Math.trunc(rect.x));
    const startY = Math.max(0, Math.trunc(rect.y));
    const endX = Math.min(this.width, Math.trunc(rect.x + rect.width));
    const endY = Math.min(this.height, Math.trunc(rect.y + rect.height));
    for (let y = startY; y < endY; y += 1) {
      next.fill(1, y * this.width + startX, y * this.width + endX);
    }
    this.#combine(next, operation);
  }

  /** Kapalı çokgen (lasso) — even-odd tarama doldurma. */
  public applyPolygon(
    points: readonly { x: number; y: number }[],
    operation: SelectionOperation = 'replace',
  ): void {
    const next = new Uint8Array(this.#mask.length);
    if (points.length >= 3) {
      for (let y = 0; y < this.height; y += 1) {
        const crossings: number[] = [];
        for (let index = 0; index < points.length; index += 1) {
          const a = points[index];
          const b = points[(index + 1) % points.length];
          // Yatay kenarlar atlanır; tarama çizgisiyle çakışınca çift sayım
          // yapar ve dolgu ters döner.
          if (a.y === b.y) continue;
          const sample = y + 0.5;
          if (sample < Math.min(a.y, b.y) || sample >= Math.max(a.y, b.y)) continue;
          crossings.push(a.x + ((sample - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
        crossings.sort((left, right) => left - right);
        for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
          const from = Math.max(0, Math.ceil(crossings[pair] - 0.5));
          const to = Math.min(this.width, Math.ceil(crossings[pair + 1] - 0.5));
          if (to > from) next.fill(1, y * this.width + from, y * this.width + to);
        }
      }
    }
    this.#combine(next, operation);
  }

  /**
   * Sihirli değnek: bitişik ve tolerans içinde kalan pikselleri seçer.
   *
   * Tarama yığın tabanlıdır; özyineleme büyük tek renkli alanda çağrı yığınını
   * taşırır.
   */
  public applyMagicWand(
    surface: RasterSurface,
    x: number,
    y: number,
    tolerance: number,
    operation: SelectionOperation = 'replace',
  ): void {
    const next = new Uint8Array(this.#mask.length);
    if (surface.contains(x, y)) {
      const target = surface.getPixel(x, y);
      const limit = Math.max(0, tolerance);
      const visited = new Uint8Array(this.#mask.length);
      const stack: number[] = [y * this.width + x];
      while (stack.length > 0) {
        const index = stack.pop() as number;
        if (visited[index] === 1) continue;
        visited[index] = 1;
        const px = index % this.width;
        const py = (index - px) / this.width;
        if (!withinTolerance(surface.getPixel(px, py), target, limit)) continue;
        next[index] = 1;
        if (px > 0) stack.push(index - 1);
        if (px + 1 < this.width) stack.push(index + 1);
        if (py > 0) stack.push(index - this.width);
        if (py + 1 < this.height) stack.push(index + this.width);
      }
    }
    this.#combine(next, operation);
  }

  #combine(next: Uint8Array, operation: SelectionOperation): void {
    if (operation === 'replace') {
      this.#mask.set(next);
    } else {
      for (let index = 0; index < this.#mask.length; index += 1) {
        const current = this.#mask[index];
        const incoming = next[index];
        this.#mask[index] =
          operation === 'add'
            ? current | incoming
            : operation === 'subtract'
            ? current & (incoming ^ 1)
            : current & incoming;
      }
    }
    this.#recompute();
  }

  #recompute(): void {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let index = 0; index < this.#mask.length; index += 1) {
      if (this.#mask[index] !== 1) continue;
      const x = index % this.width;
      const y = (index - x) / this.width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) {
      this.#empty = true;
      this.#bounds = null;
      return;
    }
    this.#empty = false;
    this.#bounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
}

function withinTolerance(candidate: Rgba, target: Rgba, tolerance: number): boolean {
  if (tolerance === 0) {
    return (
      candidate.r === target.r &&
      candidate.g === target.g &&
      candidate.b === target.b &&
      candidate.a === target.a
    );
  }
  return (
    Math.abs(candidate.r - target.r) <= tolerance &&
    Math.abs(candidate.g - target.g) <= tolerance &&
    Math.abs(candidate.b - target.b) <= tolerance &&
    Math.abs(candidate.a - target.a) <= tolerance
  );
}
