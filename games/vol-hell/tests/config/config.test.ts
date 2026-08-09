import { describe, it, expect } from 'vitest';
import { playerConfig } from '@/config/player';
import { physicsConfig } from '@/config/physics';
import { audioConfig } from '@/config/audio';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { enemyConfig } from '@/config/enemy';
import { difficultyConfig } from '@/config/difficulty';
import { bulletConfig } from '@/config/bullet';

describe('config/player', () => {
  it('moveSpeed pozitif', () => {
    expect(playerConfig.moveSpeed).toBeGreaterThan(0);
  });

  it('dashSpeed > moveSpeed (dash daha hızlı)', () => {
    expect(playerConfig.dashSpeed).toBeGreaterThan(playerConfig.moveSpeed);
  });

  it('maxHealth pozitif', () => {
    expect(playerConfig.maxHealth).toBeGreaterThan(0);
  });

  it('hitboxRadius küçük (bullet-hell klasik)', () => {
    expect(playerConfig.hitboxRadius).toBeLessThanOrEqual(16);
  });

  it('dashDurationMs < dashChargeMs', () => {
    expect(playerConfig.dashDurationMs).toBeLessThan(playerConfig.dashChargeMs);
  });
});

describe('config/physics', () => {
  it('gravity sıfır (top-down)', () => {
    expect(physicsConfig.gravity.x).toBe(0);
    expect(physicsConfig.gravity.y).toBe(0);
  });

  it('overlapResolve iterasyon sayısı pozitif', () => {
    expect(physicsConfig.overlapResolve.iterations).toBeGreaterThan(0);
    expect(physicsConfig.overlapResolve.pushFactor).toBeGreaterThan(0);
  });
});

describe('config/audio', () => {
  it('volume değerleri 0-1 aralığında', () => {
    for (const v of [audioConfig.masterVolume, audioConfig.sfxVolume, audioConfig.musicVolume]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('config/ui', () => {
  it('lowHealthThreshold 0-1 aralığında', () => {
    expect(uiConfig.lowHealthThreshold).toBeGreaterThan(0);
    expect(uiConfig.lowHealthThreshold).toBeLessThan(1);
  });

  it('hudPadding pozitif', () => {
    expect(uiConfig.hudPadding).toBeGreaterThan(0);
  });
});

describe('config/game', () => {
  it('title VOL.HELL', () => {
    expect(gameConfig.title).toBe('VOL.HELL');
  });

  it('viewport strategy resize', () => {
    expect(gameConfig.viewport.strategy).toBe('resize');
  });

  it('maxDeltaMs ve shake parametreleri tanımlı', () => {
    expect(gameConfig.maxDeltaMs).toBeGreaterThan(0);
    expect(gameConfig.shake.enemyDeath.durationMs).toBeGreaterThan(0);
    expect(gameConfig.shake.playerDamage.intensity).toBeGreaterThan(0);
    expect(gameConfig.shake.enemyDeath.cooldownMs).toBeGreaterThan(0);
    expect(gameConfig.shake.playerDamage.cooldownMs).toBeGreaterThan(0);
  });

  it('particle havuzu kapasitesi yeterli', () => {
    expect(gameConfig.particlePoolSize).toBeGreaterThanOrEqual(128);
  });
});

describe('config/enemy', () => {
  it('scoreValue pozitif', () => {
    expect(enemyConfig.scoreValue).toBeGreaterThan(0);
  });
});

describe('config/bullet', () => {
  it('bounce ses cooldown pozitif ve makul', () => {
    expect(bulletConfig.bounceSoundCooldownMs).toBeGreaterThan(0);
    expect(bulletConfig.bounceSoundCooldownMs).toBeLessThan(500);
  });
});

describe('config/difficulty', () => {
  it('büyme parametreleri pozitif', () => {
    expect(difficultyConfig.healthGrowthPerMinute).toBeGreaterThanOrEqual(0);
    expect(difficultyConfig.speedGrowthPerMinute).toBeGreaterThanOrEqual(0);
    expect(difficultyConfig.spawnRateGrowthPerMinute).toBeGreaterThanOrEqual(0);
    expect(difficultyConfig.maxEnemiesGrowthPerMinute).toBeGreaterThanOrEqual(0);
  });
});
