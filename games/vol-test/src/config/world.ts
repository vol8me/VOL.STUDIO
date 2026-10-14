/** Dünya ölçüleri. 1 metre = `metre` birim; ekran pikseliyle zoom 1'de eşittir. */
export const WORLD = {
  /**
   * Savaş dünyası: 12288 birim = 384 m. Çaprazın iki ucundaki üsler arası yaklaşık 6200 birim
   * (200 m) yoldur; dünya ölçüsü değişince `config/war.ts` düzeni oranla ölçeklenir.
   */
  width: 12288,
  height: 12288,
  /** Izgara aralığı (birim) ve kaç aralıkta bir kalın çizgi çekildiği. */
  gridStep: 128,
  gridMajorEvery: 8,
  /** Harita ızgarası: kalın çizgi 1024 birimde (32 m) bir, sıkışmadan okunur. */
  mapGridStep: 1024,
  mapGridMajorEvery: 4,
  metre: 32,
} as const;

export type WorldConfig = typeof WORLD;
