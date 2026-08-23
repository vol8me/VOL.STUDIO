export const TILE_SIZE = 64;
export const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4;

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SurfaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tek bir tile'ın değişiklik öncesi/sonrası içeriği. */
export interface TileSnapshot {
  index: number;
  /** `null` = tile o anda tümüyle saydamdı ve bellekte yoktu. */
  before: Uint8ClampedArray | null;
  after: Uint8ClampedArray | null;
}

const TRANSPARENT: Readonly<Rgba> = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

/**
 * Tile'lara bölünmüş, tembel ayrılan 8-bit sRGB unpremultiplied RGBA yüzeyi.
 *
 * Tümüyle saydam tile bellekte TUTULMAZ: 2048² boş bir belge 16 MiB yerine
 * sıfır bayt tutar ve kalem yalnız dokunduğu tile'ı var eder. Aynı bölünme
 * undo'nun da birimidir — tek piksel değişimi bütün yüzeyi değil yalnız o
 * tile'ı kopyalar, bu yüzden geçmiş byte bütçesi gerçekçi kalır.
 */
export class RasterSurface {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly #tiles = new Map<number, Uint8ClampedArray>();

  public constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError('RasterSurface boyutları pozitif tam sayı olmalıdır');
    }
    this.width = width;
    this.height = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);
  }

  /** Tam RGBA tamponundan yüzey kurar; saydam tile'lar atlanır. */
  public static fromRgba(width: number, height: number, rgba: Uint8ClampedArray): RasterSurface {
    if (rgba.length !== width * height * 4) {
      throw new RangeError('RGBA tamponu boyutla uyuşmuyor');
    }
    const surface = new RasterSurface(width, height);
    for (let ty = 0; ty < surface.tilesY; ty += 1) {
      for (let tx = 0; tx < surface.tilesX; tx += 1) {
        const tile = surface.#readTileFromRgba(rgba, tx, ty);
        if (tile !== null) surface.#tiles.set(ty * surface.tilesX + tx, tile);
      }
    }
    return surface;
  }

  /** Bellekte tutulan (yani tümüyle saydam olmayan) tile sayısı. */
  public get residentTileCount(): number {
    return this.#tiles.size;
  }

  public contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  public getPixel(x: number, y: number): Rgba {
    if (!this.contains(x, y)) return { ...TRANSPARENT };
    const tile = this.#tiles.get(this.tileIndexAt(x, y));
    if (tile === undefined) return { ...TRANSPARENT };
    const offset = this.#tileOffset(x, y);
    return { r: tile[offset], g: tile[offset + 1], b: tile[offset + 2], a: tile[offset + 3] };
  }

  /**
   * Pikseli yazar ve DEĞİŞTİYSE true döner.
   *
   * Değişmeyen yazımın false dönmesi çağıranın gereksiz dirty işaretlemesini
   * ve boş undo komutu üretmesini engeller.
   */
  public setPixel(x: number, y: number, color: Rgba): boolean {
    if (!this.contains(x, y)) return false;
    const index = this.tileIndexAt(x, y);
    const offset = this.#tileOffset(x, y);
    let tile = this.#tiles.get(index);
    if (tile === undefined) {
      if (color.a === 0) return false;
      tile = new Uint8ClampedArray(TILE_BYTES);
      this.#tiles.set(index, tile);
    } else if (
      tile[offset] === color.r &&
      tile[offset + 1] === color.g &&
      tile[offset + 2] === color.b &&
      tile[offset + 3] === color.a
    ) {
      return false;
    }
    tile[offset] = color.r;
    tile[offset + 1] = color.g;
    tile[offset + 2] = color.b;
    tile[offset + 3] = color.a;
    return true;
  }

  public tileIndexAt(x: number, y: number): number {
    return Math.floor(y / TILE_SIZE) * this.tilesX + Math.floor(x / TILE_SIZE);
  }

  public tileRect(index: number): SurfaceRect {
    const tx = index % this.tilesX;
    const ty = Math.floor(index / this.tilesX);
    const x = tx * TILE_SIZE;
    const y = ty * TILE_SIZE;
    return {
      x,
      y,
      width: Math.min(TILE_SIZE, this.width - x),
      height: Math.min(TILE_SIZE, this.height - y),
    };
  }

  /** Tile'ın kopyası; saydam tile için `null`. */
  public copyTile(index: number): Uint8ClampedArray | null {
    const tile = this.#tiles.get(index);
    return tile === undefined ? null : new Uint8ClampedArray(tile);
  }

  /** Tile'ı verilen içerikle değiştirir; `null` onu saydama döndürür. */
  public restoreTile(index: number, data: Uint8ClampedArray | null): void {
    if (data === null) {
      this.#tiles.delete(index);
      return;
    }
    if (data.length !== TILE_BYTES) throw new RangeError('Tile tamponu boyutu geçersiz');
    this.#tiles.set(index, new Uint8ClampedArray(data));
  }

  /** Tümüyle saydam kalmış tile'ları bellekten düşürür. */
  public compact(): number {
    let removed = 0;
    for (const [index, tile] of [...this.#tiles]) {
      let opaque = false;
      for (let offset = 3; offset < tile.length; offset += 4) {
        if (tile[offset] !== 0) {
          opaque = true;
          break;
        }
      }
      if (!opaque) {
        this.#tiles.delete(index);
        removed += 1;
      }
    }
    return removed;
  }

  /** Bütün yüzeyi tek RGBA tamponuna düzleştirir (kaydetme ve render için). */
  public toRgba(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.width * this.height * 4);
    for (const [index, tile] of this.#tiles) {
      const rect = this.tileRect(index);
      for (let row = 0; row < rect.height; row += 1) {
        const source = row * TILE_SIZE * 4;
        const target = ((rect.y + row) * this.width + rect.x) * 4;
        out.set(tile.subarray(source, source + rect.width * 4), target);
      }
    }
    return out;
  }

  public clone(): RasterSurface {
    const copy = new RasterSurface(this.width, this.height);
    for (const [index, tile] of this.#tiles) copy.#tiles.set(index, new Uint8ClampedArray(tile));
    return copy;
  }

  #tileOffset(x: number, y: number): number {
    return ((y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)) * 4;
  }

  /** Tile'ı kaynaktan okur; tamamı saydamsa `null` döner (bellekte tutulmaz). */
  #readTileFromRgba(rgba: Uint8ClampedArray, tx: number, ty: number): Uint8ClampedArray | null {
    const originX = tx * TILE_SIZE;
    const originY = ty * TILE_SIZE;
    const rectWidth = Math.min(TILE_SIZE, this.width - originX);
    const rectHeight = Math.min(TILE_SIZE, this.height - originY);
    let tile: Uint8ClampedArray | null = null;
    for (let row = 0; row < rectHeight; row += 1) {
      const sourceStart = ((originY + row) * this.width + originX) * 4;
      const slice = rgba.subarray(sourceStart, sourceStart + rectWidth * 4);
      let opaque = false;
      for (let offset = 3; offset < slice.length; offset += 4) {
        if (slice[offset] !== 0) {
          opaque = true;
          break;
        }
      }
      if (!opaque) continue;
      tile ??= new Uint8ClampedArray(TILE_BYTES);
      tile.set(slice, row * TILE_SIZE * 4);
    }
    return tile;
  }
}
