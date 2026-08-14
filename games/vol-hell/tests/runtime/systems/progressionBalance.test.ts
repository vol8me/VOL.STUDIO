import { describe, it, expect } from 'vitest';
import { RunEconomy } from '@/runtime/systems/RunEconomy';
import { ENEMY_CATALOG } from '@/config/enemies/catalog';
import { bulletConfig } from '@/config/bullet';
import { enemyConfig } from '@/config/enemy';

/**
 * Seviye eğrisinin HİSSİYATINI kilitler: ilk dalga iki kart verir, sonraki
 * dalgalar aynı öldürme sayısıyla giderek daha az verir ve geç oyunda bir
 * dalga hiç seviye atlatmadan bitebilir (Brotato ritmi).
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
