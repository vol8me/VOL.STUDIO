import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';
import { DecalPool } from './DecalPool';

/** Bir ayak izinin ölçeksiz kenarı (birim): sivri pençenin deliği, bacaktan büyük görünmeyecek kadar küçüktür. */
const SIDE = 7;

/**
 * Örümcek ayak izleri: yere basan her pençe, zemine küçük yuvarlak bir delik açar.
 * Palet izinden kısa yaşar ve seyrektir; izi araç değil basış üretir, bu yüzden araç başına durum tutmaz.
 */
export class FootMarks {
  private readonly decals: DecalPool;

  constructor(scene: Phaser.Scene, capacityScale = 1) {
    const feet = FX.feet;
    this.decals = new DecalPool(scene, {
      texture: TEXTURE.footPrint,
      tint: PALETTE.treadMark,
      capacity: Math.max(1, Math.round(feet.capacity * capacityScale)),
      depth: feet.depth,
      lifeMs: feet.lifeMs,
      holdShare: feet.holdShare,
    });
  }

  /** `scale` aracın boyuna göredir (1 = referans yürüyücü). */
  print(x: number, y: number, angle: number, scale: number): void {
    this.decals.place(x, y, angle, SIDE * scale, SIDE * scale, FX.feet.alpha);
  }

  fade(deltaMs: number): void {
    this.decals.fade(deltaMs);
  }

  destroy(): void {
    this.decals.destroy();
  }
}
