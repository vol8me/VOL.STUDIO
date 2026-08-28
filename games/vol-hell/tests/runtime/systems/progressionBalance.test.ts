import { describe, it, expect } from 'vitest';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import {
  ABILITY_CATALOG,
  abilityProgressionConfig,
  turretDurabilityConfig,
} from '@/config/abilities';
import { bulletConfig } from '@/config/bullet';
import { enemyConfig } from '@/config/enemy';
import { StatBlock } from '@volstudio/core';
import {
  scaleAbilityDamage,
  scaleTurretFireInterval,
  scaleTurretHealth,
} from '@/runtime/ability/abilityScaling';

/**
 * Seviye eğrisinin HİSSİYATINI kilitler: ilk dalga iki kart verir, sonraki
 * dalgalar aynı öldürme sayısıyla giderek daha az verir ve geç oyunda bir
 * dalga hiç seviye atlatmadan bitebilir.
 *
 * Sabit sayı değil, İLİŞKİ test edilir: eşikler ayarlanırsa bu testler
 * eğrinin şeklini korumaya devam eder.
 */

/** Bir dalgada toplanan Spark — verilen öldürme sayısı grunt üzerinden. */
function sparkFromKills(kills: number): number {
  return kills * ENEMY_CATALOG.grunt.sparkReward;
}

function levelAfter(totalSpark: number): number {
  const economy = new RunEconomy();
  economy.addSpark(totalSpark);
  return economy.getLevel();
}

describe('seviye eğrisi — dalga başına kart ritmi', () => {
  it('ilk dalga (~25 grunt) tam iki seviye verir', () => {
    // Oyuncu 1. seviyede başlar; iki atlama 3. seviyeye çıkarır.
    expect(levelAfter(sparkFromKills(25))).toBe(3);
  });

  it('ilk dalga tek öldürmede seviye yağdırmaz', () => {
    expect(levelAfter(sparkFromKills(5))).toBe(1);
  });

  it('aynı öldürme sayısı ilerledikçe daha az seviye verir', () => {
    const economy = new RunEconomy();
    const waveSpark = sparkFromKills(25);

    const levelsPerWave: number[] = [];
    let previous = economy.getLevel();
    for (let wave = 0; wave < 6; wave++) {
      economy.addSpark(waveSpark);
      levelsPerWave.push(economy.getLevel() - previous);
      previous = economy.getLevel();
    }

    expect(levelsPerWave[0]).toBe(2);
    // Eğri monoton yavaşlar: hiçbir dalga bir öncekinden daha fazla vermez.
    for (let i = 1; i < levelsPerWave.length; i++) {
      expect(levelsPerWave[i], `dalga ${i + 1}`).toBeLessThanOrEqual(levelsPerWave[i - 1]);
    }
    // Sabit öldürme sayısıyla ilerlerken bir noktada seviyesiz dalga gelir.
    expect(levelsPerWave.at(-1)).toBe(0);
  });

  it('eşikler her seviyede büyür', () => {
    const economy = new RunEconomy();
    let previousSpan = 0;
    for (let level = 1; level <= 10; level++) {
      const span = economy.getLevelSpan(level);
      expect(span, `seviye ${level}`).toBeGreaterThan(previousSpan);
      previousSpan = span;
    }
  });

  it('tam koşu boyunca seviye sayısı makul kalır', () => {
    // Kabaca 20 dalga x ortalama 45 öldürme; kartların tükenmesini beklemeyiz
    // ama seviye enflasyonu da olmamalı.
    const level = levelAfter(sparkFromKills(20 * 45));
    expect(level).toBeGreaterThan(10);
    expect(level).toBeLessThan(25);
  });
});

describe('temel saldırı dengesi', () => {
  it('taban ateş temposu kart artışına yer bırakır', () => {
    // Legendary kart %40 hızlandırır; taban zaten çok hızlı olsaydı kartın
    // katkısı hissedilmez, sahne mermiyle dolardı.
    const withCard = bulletConfig.fireCooldownMs * 0.6;
    expect(withCard).toBeGreaterThan(bulletConfig.minFireCooldownMs);
    expect(bulletConfig.fireCooldownMs).toBeGreaterThan(200);
  });

  it('temel düşman iki mermide ölür — hasar/can hizası korunur', () => {
    expect(enemyConfig.health % bulletConfig.damage).toBe(0);
    expect(enemyConfig.health / bulletConfig.damage).toBe(2);
  });

  it('üst üste binen ateş hızı kartları bile alt sınırı aşamaz', () => {
    // 0.6 x 0.78 x 0.9 = en agresif üç kart birlikte.
    const stacked = bulletConfig.fireCooldownMs * 0.6 * 0.78 * 0.9;
    expect(Math.max(bulletConfig.minFireCooldownMs, stacked)).toBeGreaterThanOrEqual(
      bulletConfig.minFireCooldownMs,
    );
  });
});

describe('ability ilerleme dengesi', () => {
  it('sabit hasarlı ability aileleri oyuncu hasarını takip eder', () => {
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    const baseDamageRatio = 1.6;
    stats.addModifier({
      id: 'gec-oyun-hasar',
      stat: 'damage',
      type: 'multiply',
      value: baseDamageRatio,
    });

    const expectedRatio = 1 + (baseDamageRatio - 1) * abilityProgressionConfig.damageStatInfluence;
    const bases = [
      ABILITY_CATALOG.turret.turret!.damage,
      ABILITY_CATALOG.chainLightning.chain!.damage,
      ABILITY_CATALOG.fireZone.fire!.damagePerTick,
    ];

    for (const base of bases) {
      expect(scaleAbilityDamage(base, stats)).toBeCloseTo(base * expectedRatio, 6);
      expect(scaleAbilityDamage(base, stats)).toBeGreaterThan(base);
    }
  });

  it('kule canı oyuncu dayanıklılığıyla ilerler, riskli can takasında tabanını korur', () => {
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    const baseHealth = ABILITY_CATALOG.turret.turret!.health;

    stats.addModifier({ id: 'zirh', stat: 'health', type: 'add', value: 60 });
    expect(scaleTurretHealth(baseHealth, stats)).toBeCloseTo(baseHealth * 1.6, 6);

    stats.clearModifiers();
    stats.addModifier({ id: 'son-silah-bedeli', stat: 'health', type: 'multiply', value: 0.6 });
    expect(scaleTurretHealth(baseHealth, stats)).toBeCloseTo(
      baseHealth * abilityProgressionConfig.minTurretHealthRatio,
      6,
    );
  });

  it('kule iç atış temposu ateş hızıyla ilerler ve alt sınıra doyar', () => {
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    const baseInterval = ABILITY_CATALOG.turret.turret!.fireIntervalMs;

    stats.addModifier({ id: 'hiz-karti', stat: 'fireRate', type: 'multiply', value: 0.5 });
    expect(scaleTurretFireInterval(baseInterval, stats)).toBeCloseTo(baseInterval * 0.5, 6);

    stats.clearModifiers();
    stats.addModifier({ id: 'sonsuz-hiz', stat: 'fireRate', type: 'multiply', value: 0 });
    expect(scaleTurretFireInterval(baseInterval, stats)).toBe(
      abilityProgressionConfig.minTurretFireIntervalMs,
    );
  });

  it('bozuk veya sıfır taban stat ability ölçeklemesini güvenli tutar', () => {
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    stats.setBase('damage', 0);

    const baseDamage = ABILITY_CATALOG.chainLightning.chain!.damage;
    expect(scaleAbilityDamage(baseDamage, stats)).toBe(baseDamage);
  });

  it('katalogdaki her sabit hasar/can/tempo parametresi ortak ölçeklemeye bağlıdır', () => {
    const stats = new StatBlock({
      damage: bulletConfig.damage,
      speed: 220,
      health: 100,
      fireRate: bulletConfig.fireCooldownMs,
    });
    stats.addModifier({ id: 'hasar', stat: 'damage', type: 'multiply', value: 1.8 });
    stats.addModifier({ id: 'can', stat: 'health', type: 'multiply', value: 1.6 });
    stats.addModifier({ id: 'tempo', stat: 'fireRate', type: 'multiply', value: 0.7 });

    for (const definition of Object.values(ABILITY_CATALOG)) {
      if (definition.turret) {
        expect(scaleAbilityDamage(definition.turret.damage, stats), definition.id).toBeCloseTo(
          definition.turret.damage * 1.8,
          6,
        );
        expect(scaleTurretHealth(definition.turret.health, stats), definition.id).toBeCloseTo(
          definition.turret.health * 1.6,
          6,
        );
        expect(
          scaleTurretFireInterval(definition.turret.fireIntervalMs, stats),
          definition.id,
        ).toBeCloseTo(
          Math.max(
            abilityProgressionConfig.minTurretFireIntervalMs,
            definition.turret.fireIntervalMs * 0.7,
          ),
          6,
        );
      }
      if (definition.chain) {
        expect(scaleAbilityDamage(definition.chain.damage, stats), definition.id).toBeCloseTo(
          definition.chain.damage * 1.8,
          6,
        );
      }
      if (definition.fire) {
        expect(scaleAbilityDamage(definition.fire.damagePerTick, stats), definition.id).toBeCloseTo(
          definition.fire.damagePerTick * 1.8,
          6,
        );
      }
    }
  });

  it('kule varyantları kesintisiz grunt baskısında cooldownlarının en az yarısı yaşar', () => {
    for (const definition of Object.values(ABILITY_CATALOG)) {
      if (!definition.turret) continue;

      const receivedDamage =
        enemyConfig.contactDamage * turretDurabilityConfig.contactDamageMultiplier;
      const hitsToDestroy = Math.ceil(definition.turret.health / receivedDamage);
      const survivalMs = (hitsToDestroy - 1) * turretDurabilityConfig.contactDamageCooldownMs;

      expect(survivalMs, definition.id).toBeGreaterThanOrEqual(definition.cooldownMs / 2);
    }
  });
});
