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
  /**
   * Haritanın açılış yakınlaştırması ve üst sınırı. Dünya 384 m olduğundan zoom 1'de araç haritada
   * kıpırdamaz (kare başına piksel altı); zoom 4 çevredeki ~96 m'yi gösterir, bölge halkaları okunur
   * ve hareket her karede görünür. Zoom 1 bütün cephe hattını gösterir.
   */
  mapZoom: 4,
  mapMaxZoom: 12,
  metre: 32,
} as const;

export type WorldConfig = typeof WORLD;
