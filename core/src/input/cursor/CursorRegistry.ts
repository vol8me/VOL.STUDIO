import type { CursorAsset, CursorId, CursorRegistryMap, CursorTheme } from './types';

/**
 * Cursor varlıklarını kimlikle kaydetme ve çözme.
 *
 * Bir tema kurulduğunda tema içindeki tüm cursor'lar kaydedilir.
 * Bilinmeyen bir id istenirse `default` cursor'una düşülür.
 */
export class CursorRegistry {
  readonly #map: CursorRegistryMap = new Map();

  register(asset: CursorAsset): void {
    this.#map.set(asset.id, asset);
  }

  registerTheme(theme: CursorTheme): void {
    for (const asset of Object.values(theme.cursors)) {
      this.register(asset);
    }
  }

  resolve(id: CursorId): CursorAsset {
    const found = this.#map.get(id);
    if (found) return found;

    const defaultCursor = this.#map.get('default');
    if (!defaultCursor) {
      throw new Error(`CursorRegistry: 'default' cursor'u tanımlı değil`);
    }
    return defaultCursor;
  }

  reset(): void {
    this.#map.clear();
  }

  get size(): number {
    return this.#map.size;
  }
}
