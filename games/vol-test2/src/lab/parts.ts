/**
 * Sahne nesnesi portu: rig ve prop katmanları Phaser'ı tanımaz, yalnız bu yüzeyi kullanır.
 * Phaser'ın `Image` ve `TileSprite` nesneleri bu arayüze yapısal olarak uyar, sarmalayıcı yoktur
 * (kare başına ek tahsis ve yönlendirme maliyeti ölçümü kirletirdi); testler sahte bir fabrikayla koşar.
 */
/** Tasarım biriminde (x, y) çifti. */
export type Vec = readonly [number, number];

export interface PartPort {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
  visible: boolean;
  setOrigin(x: number, y: number): unknown;
  setBlendMode(mode: number): unknown;
  setDepth(depth: number): unknown;
  destroy(): void;
}

export interface TilePort extends PartPort {
  tilePositionX: number;
  tilePositionY: number;
  tileScaleX: number;
  tileScaleY: number;
}

export interface PartFactory {
  image(key: string): PartPort;
  /** Boyutu verilen, dokusu tekrarlayan nesne (kayan bant). */
  tile(key: string, width: number, height: number): TilePort;
}

/** Phaser `BlendModes` sabitleri; `tests/lab/parts.test.ts` ve e2e Phaser'daki değerlerle eşitliğini sınar. */
export const BLEND = { normal: 0, add: 1 } as const;
