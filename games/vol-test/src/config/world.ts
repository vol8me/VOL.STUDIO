/** Dünya ölçüleri. 1 metre = `metre` birim; ekran pikseliyle zoom 1'de eşittir. */
export const WORLD = {
  width: 4096,
  height: 4096,
  /** Izgara aralığı (birim). */
  gridStep: 128,
  metre: 32,
} as const;

export type WorldConfig = typeof WORLD;
