import { describe, it, expect } from 'vitest';
import { playerConfig } from '@/config/player';
import { physicsConfig } from '@/config/physics';
import { audioConfig } from '@/config/audio';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';

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

  it("fixedDeltaMs 60 FPS'e yakın", () => {
    expect(physicsConfig.fixedDeltaMs).toBeCloseTo(16.67, 1);
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
});
