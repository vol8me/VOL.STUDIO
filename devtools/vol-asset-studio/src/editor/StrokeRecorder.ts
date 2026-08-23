import type { HistoryCommand } from '@volstudio/core/ui';
import { TILE_BYTES, type RasterSurface, type TileSnapshot } from './RasterSurface';

export interface StrokeCommandOptions {
  label: string;
  /** Ardışık aynı-tür gesture'ları tek adıma indirmek isteyen araçlar için. */
  mergeKey?: string;
}

/**
 * Bir gesture boyunca dokunulan tile'ların önce/sonra görüntüsünü tutar.
 *
 * Araç sözleşmesi "her pointer gesture en fazla bir undo üretir" der. Kaydedici
 * bunu tile granülerliğinde yapar: kalem 2048² belgede üç tile'a dokunduysa
 * geçmişe 12 MiB'lık yüzey değil 3 × 16 KiB girer. Önce-görüntüsü tile'a İLK
 * dokunulduğunda alınır; sonraki darbeler onu ezmez, yoksa undo gesture'ın
 * ortasına dönerdi.
 */
export class StrokeRecorder {
  readonly #surface: RasterSurface;
  readonly #before = new Map<number, Uint8ClampedArray | null>();

  public constructor(surface: RasterSurface) {
    this.#surface = surface;
  }

  public get touchedTileCount(): number {
    return this.#before.size;
  }

  /** Tile'a dokunmadan ÖNCE çağrılır; ilk çağrı görüntüyü saklar. */
  public captureTile(index: number): void {
    if (this.#before.has(index)) return;
    this.#before.set(index, this.#surface.copyTile(index));
  }

  /** Piksel yazımını kaydedici üzerinden yapar. */
  public setPixel(x: number, y: number, color: Parameters<RasterSurface['setPixel']>[2]): boolean {
    if (!this.#surface.contains(x, y)) return false;
    this.captureTile(this.#surface.tileIndexAt(x, y));
    return this.#surface.setPixel(x, y, color);
  }

  /** Gerçekten değişen tile'ların anlık görüntüleri. */
  public collect(): TileSnapshot[] {
    const snapshots: TileSnapshot[] = [];
    for (const [index, before] of this.#before) {
      const after = this.#surface.copyTile(index);
      if (equalTiles(before, after)) continue;
      snapshots.push({ index, before, after });
    }
    return snapshots;
  }

  /**
   * Gesture'ı tek undo komutuna çevirir; hiçbir piksel değişmediyse `null`.
   *
   * `null` dönmesi önemlidir: boş komut geçmişe girerse kullanıcı bir kez
   * undo'ya bastığında hiçbir şey olmaz ve geçmiş yalan söyler.
   */
  public toCommand(options: StrokeCommandOptions): HistoryCommand | null {
    const snapshots = this.collect();
    if (snapshots.length === 0) return null;
    return createTileCommand(this.#surface, snapshots, options);
  }
}

/** Tile anlık görüntülerinden geri alınabilir komut üretir. */
export function createTileCommand(
  surface: RasterSurface,
  snapshots: readonly TileSnapshot[],
  options: StrokeCommandOptions,
): HistoryCommand {
  const frozen = snapshots.map((snapshot) => ({
    index: snapshot.index,
    before: snapshot.before === null ? null : new Uint8ClampedArray(snapshot.before),
    after: snapshot.after === null ? null : new Uint8ClampedArray(snapshot.after),
  }));
  // Saydam tile `null` olarak saklanır ve bellek maliyeti taşımaz; bütçe
  // yalnız gerçekten tutulan tamponları sayar.
  const byteCost = frozen.reduce(
    (sum, snapshot) =>
      sum +
      (snapshot.before === null ? 0 : TILE_BYTES) +
      (snapshot.after === null ? 0 : TILE_BYTES),
    0,
  );
  return {
    label: options.label,
    byteCost,
    ...(options.mergeKey === undefined ? {} : { mergeKey: options.mergeKey }),
    apply: () => {
      for (const snapshot of frozen) surface.restoreTile(snapshot.index, snapshot.after);
    },
    revert: () => {
      for (const snapshot of frozen) surface.restoreTile(snapshot.index, snapshot.before);
    },
  };
}

function equalTiles(a: Uint8ClampedArray | null, b: Uint8ClampedArray | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}
