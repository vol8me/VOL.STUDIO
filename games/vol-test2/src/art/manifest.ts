import { KIT, type AssetId } from './kit/catalog';

export type { AssetId };

/** Tasarım birimi: 1 karo = 64. Parçalar (bacak, halka, parıltı) kendi bağlantı noktalarıyla tasarlanmıştır. */
export const TILE_UNITS = 64;

export interface Asset {
  readonly id: AssetId;
  /** Kaynak dosya adı (`kit/` içinde). */
  readonly file: string;
  /** Vite'ın verdiği adres; SVG gömülmez (Phaser yükleyicisi `data:` adresini base64 sanır). */
  readonly url: string;
  /** SVG `viewBox` boyutu (tasarım birimi); `tests/art/kit.test.ts` dosyayla eşitliğini doğrular. */
  readonly width: number;
  readonly height: number;
}

/**
 * Üstten bakış (kuş bakışı), karo tabanlı, dolgun varlık seti. Kaynak `scripts/art` üreticisidir;
 * kimlikler ve boyutlar `kit/catalog.ts`ten (üretilmiş) gelir. Hareketli parçalar (rotor, halka, bant,
 * bacak) ayrı dosyadır ve kendi bağlantı noktasıyla çizilir; parıltılar additive çizilsin diye ayrıdır.
 */
export const ASSET_LIST: readonly Asset[] = (Object.keys(KIT) as AssetId[]).map((id) => ({
  id,
  file: `${id}.svg`,
  ...KIT[id],
}));

export const ASSETS: Readonly<Record<AssetId, Asset>> = Object.fromEntries(
  ASSET_LIST.map((asset) => [asset.id, asset]),
) as Record<AssetId, Asset>;
