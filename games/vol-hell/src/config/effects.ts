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
  | 'fluxPickup'
  | 'turretPlace'
  | 'turretShot'
  | 'turretImpact'
  | 'turretHit'
  | 'turretDestroy'
  | 'chainHop'
  | 'fireZoneSpawn'
  | 'fireZoneTick'
  | 'fireZoneBurn'
  | 'multiShotCast'
  | 'cardPicked'
  | 'waveClear'
  | 'eliteSpawn'
  | 'bossSpawn'
  | 'bossSlam'
  | 'bossSummon'
  | 'bossVolley'
  | 'bossDefeat';

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

  // --- Ability efektleri ---------------------------------------------------

  turretPlace: {
    particles: {
      count: 14,
      speed: { min: 60, max: 160 },
      lifespan: { min: 220, max: 420 },
      scale: { start: 0.45, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x44ddaa, 0x88ffdd],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
    shake: { durationMs: 70, intensity: 0.004, cooldownMs: 200 },
  },

  turretShot: {
    particles: {
      count: 3,
      speed: { min: 40, max: 120 },
      lifespan: { min: 90, max: 170 },
      scale: { start: 0.26, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0x88ffdd, 0xffffff],
      angleSpread: 20,
      depth: RENDER_DEPTH.abilityVisual,
      additive: true,
    },
  },

  turretImpact: {
    particles: {
      count: 5,
      speed: { min: 50, max: 150 },
      lifespan: { min: 100, max: 200 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xbbffee, 0xffffff],
      depth: RENDER_DEPTH.abilityVisual,
      additive: true,
    },
  },

  turretHit: {
    particles: {
      count: 4,
      speed: { min: 40, max: 120 },
      lifespan: { min: 120, max: 240 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0x44ddaa, 0xff7744],
      depth: RENDER_DEPTH.impactEffect,
    },
  },

  turretDestroy: {
    particles: {
      count: 16,
      speed: { min: 80, max: 220 },
      lifespan: { min: 240, max: 460 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0x44ddaa, 0x336655],
      depth: RENDER_DEPTH.impactEffect,
    },
    shake: { durationMs: 90, intensity: 0.006, cooldownMs: 250 },
  },

  chainHop: {
    particles: {
      count: 9,
      speed: { min: 70, max: 210 },
      lifespan: { min: 130, max: 260 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x88ccff, 0xffffff, 0x4477ff],
      depth: RENDER_DEPTH.abilityVisual,
      additive: true,
    },
  },

  fireZoneSpawn: {
    particles: {
      count: 18,
      speed: { min: 50, max: 190 },
      lifespan: { min: 260, max: 520 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff7722, 0xffcc33, 0xff3311],
      depth: RENDER_DEPTH.abilityGround,
      additive: true,
    },
    shake: { durationMs: 80, intensity: 0.005, cooldownMs: 300 },
  },

  fireZoneTick: {
    particles: {
      count: 2,
      speed: { min: 10, max: 60 },
      lifespan: { min: 220, max: 420 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [0xff9933, 0xffcc55],
      // Yukarı doğru yükselen kıvılcım — alev hissi.
      angle: { min: 250, max: 290 },
      depth: RENDER_DEPTH.abilityGround,
      additive: true,
    },
  },

  fireZoneBurn: {
    particles: {
      count: 2,
      speed: { min: 20, max: 70 },
      lifespan: { min: 180, max: 320 },
      scale: { start: 0.26, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff5522, 0xffaa44],
      // Yanan düşmanın üstünden yükselir.
      angle: { min: 250, max: 290 },
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
  },

  multiShotCast: {
    particles: {
      count: 10,
      speed: { min: 90, max: 240 },
      lifespan: { min: 110, max: 220 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffee66, 0xffffff],
      // Nişan yönüne yayılan namlu parlaması.
      angleSpread: 30,
      depth: RENDER_DEPTH.abilityVisual,
      additive: true,
    },
    shake: { durationMs: 50, intensity: 0.004, cooldownMs: 200 },
  },

  cardPicked: {
    particles: {
      count: 20,
      speed: { min: 60, max: 220 },
      lifespan: { min: 300, max: 620 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffdd66, 0x88ccff],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
  },

  // --- Dalga ve özel düşman efektleri --------------------------------------

  /**
   * Dalga sonu temizliği — ölüm DEĞİL, buharlaşma.
   * Ölüm efektinden bilinçli olarak farklı: soğuk renk, dışa değil içe
   * sönen küçük bir parlama. Oyuncu "öldürdüm" sanmasın.
   */
  waveClear: {
    particles: {
      count: 7,
      speed: { min: 10, max: 45 },
      lifespan: { min: 200, max: 380 },
      scale: { start: 0.34, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [0x88ccff, 0xffffff],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
  },

  eliteSpawn: {
    particles: {
      count: 28,
      speed: { min: 90, max: 300 },
      lifespan: { min: 320, max: 700 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xcc3366, 0xff88bb, 0xffffff],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
    shake: { durationMs: 240, intensity: 0.012, cooldownMs: 1000 },
  },

  bossSpawn: {
    particles: {
      count: 40,
      speed: { min: 120, max: 380 },
      lifespan: { min: 420, max: 900 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x7733cc, 0xcc99ff, 0xffffff],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
    shake: { durationMs: 380, intensity: 0.018, cooldownMs: 1000 },
  },

  bossSlam: {
    particles: {
      count: 24,
      speed: { min: 140, max: 420 },
      lifespan: { min: 260, max: 520 },
      scale: { start: 0.66, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xcc99ff, 0xffffff],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
    shake: { durationMs: 160, intensity: 0.014, cooldownMs: 300 },
  },

  bossSummon: {
    particles: {
      count: 16,
      speed: { min: 60, max: 180 },
      lifespan: { min: 220, max: 460 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x9955dd, 0xcc99ff],
      depth: RENDER_DEPTH.groundEffect,
      additive: true,
    },
  },

  bossVolley: {
    particles: {
      count: 8,
      speed: { min: 80, max: 200 },
      lifespan: { min: 140, max: 280 },
      scale: { start: 0.36, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0x9955dd, 0xffffff],
      angleSpread: 24,
      depth: RENDER_DEPTH.abilityVisual,
      additive: true,
    },
  },

  bossDefeat: {
    particles: {
      count: 56,
      speed: { min: 120, max: 460 },
      lifespan: { min: 500, max: 1100 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x7733cc, 0xcc99ff, 0xffffff, 0xffdd66],
      depth: RENDER_DEPTH.impactEffect,
      additive: true,
    },
    shake: { durationMs: 460, intensity: 0.02, cooldownMs: 1000 },
  },
};

export type EffectsConfig = typeof effectsConfig;
