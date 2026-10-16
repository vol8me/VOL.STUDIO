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
  /** Havuzda en son gösterilen alfa basamağı (`ALPHA_STEPS`); sönmeyen çıkartma her karede yeniden yazılmaz. */
  level: number;
  /** Bu görüntü kaç kez yeniden kullanıldı: eski bir `DecalRef` yeni çıkartmayı bozmasın. */
  generation: number;
}

/** Yaşayan bir çıkartmaya tutamak: görüntü başkasına devredildiyse (`reshape`) geçersizdir. */
export interface DecalRef {
  readonly decal: Decal;
  readonly generation: number;
}

/** Sönüş basamağı: alfa bu kadar adımda yazılır; göz farkı görmez, her karede onlarca `setAlpha` gitmez. */
const ALPHA_STEPS = 48;

/**
 * Zemine basılan çıkartmaların havuzu: palet izi, kayma çizgisi, yanık.
 * Görüntüler kapasiteye dek bir kez kurulur; havuz dolunca en eski çıkartma
 * yeniden kullanılır. Her çıkartma ömrünün ilk payında tam görünür, sonra
 * doğrusal söner. Karede ayırma yapılmaz; sönüş yalnız yaşı tutuş süresini
 * aşan çıkartmalara ve alfa basamağı değişince uygulanır (halka doğum sırasındadır,
 * ilk genç çıkartmada tarama biter).
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
    frame?: string | number,
  ): DecalRef {
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
        level: ALPHA_STEPS,
        generation: 0,
      };
      this.pool.push(decal);
    } else {
      decal = this.decals.first!;
      decal.generation += 1;
    }
    if (frame !== undefined) decal.image.setFrame(frame);
    decal.image
      .setPosition(x, y)
      .setRotation(rotation)
      .setDisplaySize(width, height)
      .setAlpha(alpha);
    decal.bornMs = this.nowMs;
    decal.alpha = alpha;
    decal.level = ALPHA_STEPS;
    this.decals.push(decal);
    return { decal, generation: decal.generation };
  }

  /**
   * Yerleştirilmiş çıkartmayı yeniden biçimlendirir (devam eden palet bandı uzar). Görüntü bu arada
   * havuz dolduğu için başkasına verildiyse dokunmaz ve `false` döner; doğum zamanı değişmez.
   */
  reshape(
    ref: DecalRef,
    x: number,
    y: number,
    rotation: number,
    width: number,
    height: number,
    frame?: string | number,
  ): boolean {
    const { decal } = ref;
    if (decal.generation !== ref.generation) return false;
    if (frame !== undefined) decal.image.setFrame(frame);
    decal.image.setPosition(x, y).setRotation(rotation).setDisplaySize(width, height);
    return true;
  }

  fade(deltaMs: number): void {
    this.nowMs += deltaMs;
    const { lifeMs, holdShare } = this.config;
    const hold = lifeMs * holdShare;
    for (let index = 0; index < this.decals.size; index++) {
      const decal = this.decals.at(index);
      if (!decal) continue;
      const age = this.nowMs - decal.bornMs;
      // Doğum sırasıyla dizili: ilk tutuştaki çıkartmadan ötesi daha gençtir, söndürülecek şey yoktur.
      if (age <= hold) break;
      const remaining = Math.max(0, 1 - (age - hold) / (lifeMs - hold));
      const level = Math.round(remaining * ALPHA_STEPS);
      if (level === decal.level) continue;
      decal.level = level;
      decal.image.setAlpha((level / ALPHA_STEPS) * decal.alpha);
    }
  }

  destroy(): void {
    for (const decal of this.pool) decal.image.destroy();
  }
}
