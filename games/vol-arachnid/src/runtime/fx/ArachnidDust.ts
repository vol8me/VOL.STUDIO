import type Phaser from 'phaser';
import { clamp01, lerp } from '@volstudio/core';
import { fxConfig } from '@/config/fx';

/** Toz dokusunun TextureManager anahtarı — sahneler arasında paylaşılır. */
const DUST_TEXTURE_KEY = 'vol-arachnid-dust';

/**
 * Pençe temasında kalkan toz.
 *
 * Ayağın yere BASTIĞI kare dışında hiç yayım yoktur: sürekli akan bir emitter
 * yaratığı tozlu bir buluta çevirir, oysa aranan şey temasın kendisidir. Toz
 * miktarı gövde hızıyla ölçeklenir — ağır ağır yürüyen bir ayak toz kaldırmaz.
 */
export class ArachnidDust {
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private destroyed = false;

  constructor(scene: Phaser.Scene) {
    ensureTexture(scene);
    const dust = fxConfig.dust;
    this.emitter = scene.add.particles(0, 0, DUST_TEXTURE_KEY, {
      speed: { min: dust.speedMin, max: dust.speedMax },
      lifespan: { min: dust.lifespanMinMs, max: dust.lifespanMaxMs },
      scale: { start: dust.scaleStart, end: dust.scaleEnd },
      alpha: { start: dust.alphaStart, end: dust.alphaEnd },
      tint: dust.tint,
      angle: { min: 0, max: 360 },
      // Akış kapalı: toz yalnız ayak bastığında patlar.
      emitting: false,
    });
    this.emitter.setDepth(dust.depth);
  }

  /** Verilen noktada, gövde hızıyla ölçeklenmiş bir toz bulutu bırakır. */
  puff(x: number, y: number, speedPxPerSec: number): void {
    if (this.destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const dust = fxConfig.dust;
    const speed = Number.isFinite(speedPxPerSec) ? speedPxPerSec : 0;
    if (speed < dust.minSpeedPxPerSec) return;

    const intensity = clamp01(
      (speed - dust.minSpeedPxPerSec) / (dust.fullSpeedPxPerSec - dust.minSpeedPxPerSec),
    );
    const count = Math.round(lerp(dust.countMin, dust.countMax, intensity));
    if (count > 0) this.emitter.emitParticleAt(x, y, count);
  }

  /**
   * Havada asılı tüm tozu anında tüketir.
   *
   * Atılım başladığında yürüyüşten kalan partiküller hâlâ yaşıyor (ömür
   * 180-380 ms) ve gövdenin etrafında sürükleniyor; oyuncu bunu "atılım tozu"
   * olarak görüyor. Atılım temiz bir kare ister.
   */
  clear(): void {
    if (this.destroyed) return;
    this.emitter.killAll();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emitter.destroy();
  }
}

/** Yumuşak kenarlı beyaz daire; rengi emitter'ın `tint` değeri verir. */
function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(DUST_TEXTURE_KEY)) return;
  const radius = fxConfig.dust.textureRadiusPx;
  const graphics = scene.add.graphics();
  graphics.fillStyle(0xffffff, 1);
  graphics.fillCircle(radius, radius, radius);
  graphics.generateTexture(DUST_TEXTURE_KEY, radius * 2, radius * 2);
  graphics.destroy();
}
