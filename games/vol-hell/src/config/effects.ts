import { bulletConfig } from './bullet';
import { enemyConfig } from './enemy';
import { playerConfig } from './player';
import { RENDER_DEPTH } from './layers';

/**
 * Görsel efekt tanımları — hangi oyun olayının hangi partikül/sarsıntı
 * kombinasyonuna karşılık geldiği TEK yerde durur.
 *
 * Efektler Phaser'ın kendi `ParticleEmitter`'ı ile çalışır; havuzlama,
 * ömür yönetimi ve interpolasyon motorun işidir. Yeni bir olay (kule, zincir
 * yıldırım, kart geçişi…) eklendiğinde buraya bir satır yazmak yeterlidir.
 */

/** Efekt kimlikleri — `EffectManager.play()` bunlarla çağrılır. */
export type EffectId =
  | 'bulletFire'
  | 'bulletTrail'
  | 'bulletBounce'
  | 'enemyHit'
  | 'enemyDeath'
  | 'enemyDash'
  | 'playerDash'
  | 'playerHit'
  | 'fluxPickup';

/** Bir efektin partikül patlaması parametreleri. */
export interface ParticleBurstSpec {
  /** Tetiklenince çıkan partikül sayısı. */
  count: number;
  /** Çıkış hızı aralığı (piksel/saniye). */
  speed: { min: number; max: number };
  /** Ömür aralığı (ms). */
  lifespan: { min: number; max: number };
  /** Doku ölçeği — başlangıçtan bitişe interpole edilir. */
  scale: { start: number; end: number };
  /** Saydamlık — başlangıçtan bitişe interpole edilir. */
  alpha: { start: number; end: number };
  /** Renk(ler) (0xRRGGBB). Birden fazlaysa partikül başına rastgele seçilir. */
  tint: number | number[];
  /** Çıkış açısı aralığı (derece). Verilmezse tam daire. */
  angle?: { min: number; max: number };
  /**
   * Yönlü efektlerde `play()` çağrısına verilen açının etrafındaki yayılma
   * (derece, ±). Verilirse `angle` yerine kullanılır.
   */
  angleSpread?: number;
  /** Render derinliği — 0 varsayılan entity katmanı. */
  depth?: number;
  /** Toplayıcı blend — enerji/ışık hissi veren efektlerde. */
  additive?: boolean;
}

/** Bir efektin kamera sarsıntısı parametreleri. */
export interface ShakeSpec {
  durationMs: number;
  /** Phaser sarsıntı şiddeti (0-1). */
  intensity: number;
  /** Aynı efektin tekrar sarsması için minimum bekleme (ms). */
  cooldownMs: number;
}

export interface EffectDefinition {
  particles?: ParticleBurstSpec;
  shake?: ShakeSpec;
}

/** Partikül dokusunun yarıçapı (piksel) — ölçek 1 bu boyutu verir. */
export const PARTICLE_TEXTURE_RADIUS = 8;

export const effectsConfig: Record<EffectId, EffectDefinition> = {
  bulletFire: {
    particles: {
      count: 4,
      speed: { min: 30, max: 90 },
      lifespan: { min: 80, max: 140 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [bulletConfig.color, bulletConfig.strokeColor],
      angleSpread: 26,
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  bulletTrail: {
    particles: {
      count: 1,
      speed: { min: bulletConfig.trailSpeed * 0.5, max: bulletConfig.trailSpeed },
      lifespan: { min: bulletConfig.trailLifespanMs * 0.7, max: bulletConfig.trailLifespanMs },
      scale: { start: bulletConfig.trailParticleSize / PARTICLE_TEXTURE_RADIUS, end: 0 },
      alpha: { start: bulletConfig.trailAlpha, end: 0 },
      tint: bulletConfig.color,
      // Mermi yönünün tersine dar bir koni — iz izlenebilir kalsın.
      angleSpread: 18,
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  bulletBounce: {
    particles: {
      count: bulletConfig.bounceParticleCount,
      speed: { min: bulletConfig.bounceParticleSpeedMin, max: bulletConfig.bounceParticleSpeedMax },
      lifespan: {
        min: bulletConfig.bounceParticleLifespanMs * 0.6,
        max: bulletConfig.bounceParticleLifespanMs,
      },
      scale: { start: bulletConfig.bounceParticleSize / PARTICLE_TEXTURE_RADIUS, end: 0 },
      alpha: { start: bulletConfig.bounceParticleAlpha, end: 0 },
      tint: [...bulletConfig.bounceColors],
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  enemyHit: {
    particles: {
      count: 5,
      speed: { min: 60, max: 150 },
      lifespan: { min: 120, max: 220 },
      scale: { start: 0.32, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [enemyConfig.deathParticleColor, enemyConfig.strokeColor],
      depth: RENDER_DEPTH.impactEffect,
    },
  },

  enemyDeath: {
    particles: {
      count: enemyConfig.deathParticleCount,
      speed: { min: enemyConfig.deathParticleSpeed * 0.6, max: enemyConfig.deathParticleSpeed },
      lifespan: {
        min: enemyConfig.deathParticleLifespanMs * 0.7,
        max: enemyConfig.deathParticleLifespanMs,
      },
      scale: { start: enemyConfig.deathParticleSize / PARTICLE_TEXTURE_RADIUS, end: 0 },
      alpha: { start: enemyConfig.deathParticleAlpha, end: 0 },
      tint: [enemyConfig.deathParticleColor, enemyConfig.color],
      depth: RENDER_DEPTH.impactEffect,
    },
    shake: { durationMs: 60, intensity: 0.006, cooldownMs: 180 },
  },

  enemyDash: {
    particles: {
      count: 6,
      speed: { min: 40, max: 110 },
      lifespan: { min: 140, max: 240 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: 0xff7733,
      // Atılımın tersine saçılır — nereden geldiği okunur olsun.
      angleSpread: 34,
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  playerDash: {
    particles: {
      count: 2,
      speed: { min: 0, max: 25 },
      lifespan: {
        min: playerConfig.dashGhostLifespanMs * 0.6,
        max: playerConfig.dashGhostLifespanMs,
      },
      scale: {
        start: playerConfig.hitboxRadius / PARTICLE_TEXTURE_RADIUS,
        end: (playerConfig.hitboxRadius / PARTICLE_TEXTURE_RADIUS) * playerConfig.dashGhostScaleEnd,
      },
      alpha: { start: playerConfig.dashGhostAlpha, end: 0 },
      tint: [playerConfig.dashColor, playerConfig.ghostStrokeColor],
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  playerHit: {
    particles: {
      count: 8,
      speed: { min: 70, max: 180 },
      lifespan: { min: 150, max: 300 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [playerConfig.hitColor, playerConfig.color],
      depth: RENDER_DEPTH.impactEffect,
    },
    shake: { durationMs: 100, intensity: 0.009, cooldownMs: 400 },
  },

  fluxPickup: {
    particles: {
      count: 6,
      speed: { min: 30, max: 80 },
      lifespan: { min: 180, max: 320 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x66ffcc, 0x33ddaa],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
  },
};

export type EffectsConfig = typeof effectsConfig;
