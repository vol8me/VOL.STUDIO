import { describe, it, expect } from 'vitest';
import { playerConfig } from '@/config/player';
import { physicsConfig } from '@/config/physics';
import { audioConfig, sfxVolumes } from '@/config/audio';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { enemyConfig } from '@/config/enemy';
import { difficultyConfig } from '@/config/difficulty';
import { bulletConfig } from '@/config/bullet';
import { soundAssets } from '@/config/sounds';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';

/**
 * Bu dosya SABITIN SABIT OLDUGUNU degil, config degerleri arasindaki
 * ILISKILERI dogrular. "moveSpeed pozitif" gibi tautolojiler kaldirildi:
 * davranissal degeri yoktu ve olu config anahtarlarinin silinmesini
 * engelliyorlardi.
 */
describe('config ilişkileri — oyun dengesi', () => {
  it('dash normal hareketten hızlı', () => {
    expect(playerConfig.dashSpeed).toBeGreaterThan(playerConfig.moveSpeed);
  });

  it('dash süresi cooldown süresinden kısa — dash sürekli açık kalamaz', () => {
    expect(playerConfig.dashDurationMs).toBeLessThan(playerConfig.dashChargeMs);
  });

  it('i-frame dash süresini kapsar — dash ortasında hasar alınmaz', () => {
    expect(playerConfig.dashIFrameMs).toBeGreaterThanOrEqual(playerConfig.dashDurationMs);
  });

  it('oyuncu düşmandan hızlı — kaçış her zaman mümkün', () => {
    expect(playerConfig.moveSpeed).toBeGreaterThan(enemyConfig.speed);
  });

  it('mermi oyuncudan hızlı — atış kendini geçemez', () => {
    expect(bulletConfig.speed).toBeGreaterThan(playerConfig.moveSpeed);
  });

  it('düşman canı mermi hasarının tam katı — can barı vuruş başına anlamlı', () => {
    expect(enemyConfig.health % bulletConfig.damage).toBe(0);
  });

  it('separation yarıçapı düşman çapından büyük — ayrılma etkili', () => {
    expect(enemyConfig.separationRadius).toBeGreaterThan(enemyConfig.radius * 2);
  });

  it('spawn mesafesi temas mesafesinden çok uzak — anında hasar olmaz', () => {
    expect(enemyConfig.spawnMinPlayerDistance).toBeGreaterThan(
      (enemyConfig.radius + playerConfig.hitboxRadius) * 3,
    );
  });

  it('bounceDamping enerji eklemez', () => {
    expect(bulletConfig.bounceDamping).toBeGreaterThan(0);
    expect(bulletConfig.bounceDamping).toBeLessThanOrEqual(1);
  });

  it('tüm ses seviyeleri 0-1 aralığında', () => {
    for (const [event, volume] of Object.entries(sfxVolumes)) {
      expect(volume, event).toBeGreaterThan(0);
      expect(volume, event).toBeLessThanOrEqual(1);
    }
    for (const key of ['masterVolume', 'sfxVolume', 'musicVolume', 'ambientVolume'] as const) {
      expect(audioConfig[key], key).toBeGreaterThanOrEqual(0);
      expect(audioConfig[key], key).toBeLessThanOrEqual(1);
    }
  });

  it('her ses olayının en az bir dosyası var', () => {
    for (const [event, paths] of Object.entries(soundAssets)) {
      expect(paths.length, event).toBeGreaterThan(0);
    }
  });

  it('sfxVolumes her ses olayını kapsar', () => {
    for (const event of Object.keys(soundAssets)) {
      expect(sfxVolumes, event).toHaveProperty(event);
    }
  });

  it('maxDeltaMs en az bir kare — sıfır delta oyunu dondurmaz', () => {
    expect(gameConfig.maxDeltaMs).toBeGreaterThan(0);
    expect(gameConfig.maxDeltaMs).toBeLessThanOrEqual(1000 / 20);
  });

  it('overlap çözümü en az bir iterasyon çalışır', () => {
    expect(physicsConfig.overlapResolve.iterations).toBeGreaterThan(0);
    expect(physicsConfig.overlapResolve.pushFactor).toBeGreaterThan(0);
    expect(physicsConfig.overlapResolve.pushFactor).toBeLessThanOrEqual(1);
  });

  it('düşük can eşiği anlamlı bir aralıkta', () => {
    expect(uiConfig.lowHealthThreshold).toBeGreaterThan(0);
    expect(uiConfig.lowHealthThreshold).toBeLessThan(1);
  });
});

describe('zorluk eğrisi sınırları', () => {
  it('düşman sayısı tavanı aşılamaz', () => {
    const lateGame = getDifficultyState(60 * 60 * 1000);
    expect(lateGame.maxEnemies).toBeLessThanOrEqual(difficultyConfig.maxEnemiesCap);
  });

  it('skor çarpanı tavanı aşılamaz', () => {
    const lateGame = getDifficultyState(60 * 60 * 1000);
    expect(lateGame.scoreMultiplier).toBeLessThanOrEqual(difficultyConfig.maxScoreMultiplier);
  });

  it('spawn aralığı mutlak alt sınırın altına inmez', () => {
    const lateGame = getDifficultyState(60 * 60 * 1000);
    expect(lateGame.spawnIntervalMs).toBeGreaterThanOrEqual(difficultyConfig.minSpawnIntervalMs);
  });

  it('zorluk zamanla monoton artar', () => {
    const early = getDifficultyState(0);
    const late = getDifficultyState(5 * 60 * 1000);
    expect(late.enemyHealth).toBeGreaterThan(early.enemyHealth);
    expect(late.enemySpeed).toBeGreaterThan(early.enemySpeed);
    expect(late.spawnIntervalMs).toBeLessThan(early.spawnIntervalMs);
  });
});
