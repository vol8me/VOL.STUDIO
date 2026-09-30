import type Phaser from 'phaser';
import { RingBuffer } from '@volstudio/core/collections';

export interface DecalPoolConfig {
  readonly texture: string;
  readonly tint: number;
  readonly capacity: number;
  readonly depth: number;
  /** Toplam ömür ve bu ömrün tam görünen payı; kalan pay doğrusal söner. */
  readonly lifeMs: number;
  readonly holdShare: number;
}

interface Decal {
  readonly image: Phaser.GameObjects.Image;
  bornMs: number;
  alpha: number;
}

/**
 * Zemine basılan çıkartmaların havuzu: palet izi, kayma çizgisi, yanık.
 * Görüntüler kapasiteye dek bir kez kurulur; havuz dolunca en eski çıkartma
 * yeniden kullanılır. Her çıkartma ömrünün ilk payında tam görünür, sonra
 * doğrusal söner. Karede ayırma yapılmaz.
 */
export class DecalPool {
  private readonly decals: RingBuffer<Decal>;
  private readonly pool: Decal[] = [];
  private nowMs = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: DecalPoolConfig,
  ) {
    this.decals = new RingBuffer<Decal>(config.capacity);
  }

  place(
    x: number,
    y: number,
    rotation: number,
    width: number,
    height: number,
    alpha: number,
  ): void {
    const config = this.config;
    let decal: Decal;
    if (this.pool.length < config.capacity) {
      decal = {
        image: this.scene.add
          .image(x, y, config.texture)
          .setTint(config.tint)
          .setDepth(config.depth),
        bornMs: this.nowMs,
        alpha,
      };
      this.pool.push(decal);
    } else {
      decal = this.decals.first!;
    }
    decal.image
      .setPosition(x, y)
      .setRotation(rotation)
      .setDisplaySize(width, height)
      .setAlpha(alpha);
    decal.bornMs = this.nowMs;
    decal.alpha = alpha;
    this.decals.push(decal);
  }

  fade(deltaMs: number): void {
    this.nowMs += deltaMs;
    const { lifeMs, holdShare } = this.config;
    const hold = lifeMs * holdShare;
    for (let index = 0; index < this.decals.size; index++) {
      const decal = this.decals.at(index);
      if (!decal) continue;
      const age = this.nowMs - decal.bornMs;
      const remaining = age <= hold ? 1 : 1 - (age - hold) / (lifeMs - hold);
      decal.image.setAlpha(Math.max(0, remaining) * decal.alpha);
    }
  }

  destroy(): void {
    for (const decal of this.pool) decal.image.destroy();
  }
}
