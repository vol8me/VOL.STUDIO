import Phaser from 'phaser';
import {
  effectsConfig,
  PARTICLE_TEXTURE_RADIUS,
  type EffectDefinition,
  type EffectId,
  type ParticleBurstSpec,
} from '@/config/effects';
import { finiteOr, nonNegativeFinite } from '@/runtime/utils/numeric';

/** Partikül dokusunun TextureManager anahtarı — sahneler arasında paylaşılır. */
const PARTICLE_TEXTURE_KEY = 'vol-effect-particle';

export interface EffectManagerOptions {
  /**
   * Kamera sarsıntısı çarpanı. `null` dönerse sarsıntı tamamen atlanır
   * (ayarlardan kapatılmış). Verilmezse sarsıntı uygulanmaz.
   */
  getShakeScale?: () => number | null;
}

/**
 * Merkezî efekt tetikleyici — oyunun her yerinden `effects.play('enemyDeath', x, y)`.
 *
 * Partikül işini Phaser'ın kendi `ParticleEmitter`'ı yapar: havuzlama, ömür ve
 * interpolasyon motorda zaten var. Elle yazılmış Arc havuzu + tween zinciri
 * (eski `ParticlePool`) bunun üstüne ikinci bir motor koyuyordu.
 *
 * Efekt başına bir emitter kurulur ve kapalı tutulur; olay geldiğinde
 * `emitParticleAt()` ile patlatılır. Hangi olayın hangi görüntüyü verdiği
 * `effectsConfig` içinde durur — burada sihirli sayı yoktur.
 */
export class EffectManager {
  private readonly scene: Phaser.Scene;
  private readonly options: EffectManagerOptions;
  private readonly emitters = new Map<EffectId, Phaser.GameObjects.Particles.ParticleEmitter>();
  /** Efekt başına son sarsıntı zamanı (ms) — sarsıntı spam'ini keser. */
  private readonly lastShakeAt = new Map<EffectId, number>();
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: EffectManagerOptions = {}) {
    this.scene = scene;
    this.options = options;

    this.ensureParticleTexture();
    for (const [id, definition] of Object.entries(effectsConfig) as [
      EffectId,
      EffectDefinition,
    ][]) {
      if (!definition.particles) continue;
      this.emitters.set(id, this.createEmitter(definition.particles));
    }
  }

  /**
   * Efekti verilen konumda oynatır.
   *
   * @param angleDeg Yönlü efektler için taşıyıcı açı (derece). Efekt tanımında
   * `angleSpread` varsa partiküller bu açının etrafına saçılır.
   */
  play(id: EffectId, x: number, y: number, angleDeg?: number): void {
    if (this.destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const definition = effectsConfig[id];
    if (!definition) return;
    const emitter = this.emitters.get(id);

    if (emitter && definition.particles) {
      const spread = definition.particles.angleSpread;
      if (spread !== undefined && angleDeg !== undefined && Number.isFinite(angleDeg)) {
        emitter.setEmitterAngle({ min: angleDeg - spread, max: angleDeg + spread });
      }
      emitter.emitParticleAt(x, y, definition.particles.count);
    }

    if (definition.shake) {
      this.applyShake(id, definition.shake);
    }
  }

  /** Yaşayan partikül sayısı — diagnostic sayacı için. */
  getActiveParticleCount(): number {
    if (this.destroyed) return 0;
    let total = 0;
    for (const emitter of this.emitters.values()) {
      total += emitter.getAliveParticleCount();
    }
    return total;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const emitter of this.emitters.values()) {
      emitter.destroy();
    }
    this.emitters.clear();
    this.lastShakeAt.clear();
  }

  private applyShake(id: EffectId, shake: NonNullable<EffectDefinition['shake']>): void {
    const scale = this.options.getShakeScale?.();
    if (scale === undefined || scale === null || !Number.isFinite(scale) || scale <= 0) return;

    const now = finiteOr(this.scene.time.now, 0);
    const last = this.lastShakeAt.get(id);
    if (last !== undefined && now - last < shake.cooldownMs) return;

    this.lastShakeAt.set(id, now);
    this.scene.cameras.main.shake(shake.durationMs, nonNegativeFinite(shake.intensity * scale));
  }

  private createEmitter(spec: ParticleBurstSpec): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, PARTICLE_TEXTURE_KEY, {
      speed: { min: spec.speed.min, max: spec.speed.max },
      lifespan: { min: spec.lifespan.min, max: spec.lifespan.max },
      scale: { start: spec.scale.start, end: spec.scale.end },
      alpha: { start: spec.alpha.start, end: spec.alpha.end },
      tint: spec.tint,
      angle: spec.angle ?? { min: 0, max: 360 },
      quantity: spec.count,
      blendMode: spec.additive ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      // Akış kapalı: efektler yalnızca olay geldiğinde patlatılır.
      emitting: false,
    });
    emitter.setDepth(spec.depth ?? 0);
    return emitter;
  }

  /**
   * Partikül dokusu: yumuşak kenarlı beyaz bir daire. Renk emitter'ın `tint`
   * değeriyle verilir, böylece tek doku tüm efektlere yeter.
   */
  private ensureParticleTexture(): void {
    if (this.scene.textures.exists(PARTICLE_TEXTURE_KEY)) return;

    const size = PARTICLE_TEXTURE_RADIUS * 2;
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(PARTICLE_TEXTURE_RADIUS, PARTICLE_TEXTURE_RADIUS, PARTICLE_TEXTURE_RADIUS);
    graphics.generateTexture(PARTICLE_TEXTURE_KEY, size, size);
    graphics.destroy();
  }
}
