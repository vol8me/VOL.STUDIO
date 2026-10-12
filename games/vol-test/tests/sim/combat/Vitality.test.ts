import { describe, expect, it } from 'vitest';
import { COMBAT } from '@/config/combat';
import { Vitality } from '@/sim/combat/Vitality';

describe('Vitality', () => {
  it('hasarı ve onarımı üst/alt sınırda tutar; ölüm kalıcıdır ve yeniden doğma ayrıdır', () => {
    const life = new Vitality(COMBAT);
    expect(life.damage(40)).toBe(40);
    expect(life.heal(1000)).toBe(40);
    expect(life.damage(1000)).toBe(100);
    expect(life.health).toBe(0);
    expect(life.damage(1)).toBe(0);
    expect(life.heal(1)).toBe(0);
    expect(life.respawnRemainingMs).toBe(COMBAT.respawnDelayMs);
    expect(life.step(3000).respawnReady).toBe(false);
    expect(life.step(1000).respawnReady).toBe(true);
    life.respawn();
    expect(life.health).toBe(COMBAT.maxHealth);
    expect(life.damage(30)).toBe(0);
    life.step(COMBAT.respawnProtectionMs);
    expect(life.damage(30)).toBe(30);
  });

  it('iyileşme hasardan sonra tam gecikmeyle başlar; sınır aşan adım doğru payı uygular', () => {
    const life = new Vitality(COMBAT);
    life.damage(50);
    expect(life.step(5990).regenerated).toBe(0);
    expect(life.step(1010).regenerated).toBeCloseTo(COMBAT.regenerationPerSecond);
    expect(life.health).toBeCloseTo(50 + COMBAT.regenerationPerSecond);
    life.step(100_000);
    expect(life.health).toBe(COMBAT.maxHealth);
  });

  it('bozuk sayı girişleri ve yapılandırmalar reddedilir; bozuk delta durumu kirletmez', () => {
    const life = new Vitality(COMBAT);
    for (const amount of [-1, NaN, Infinity]) {
      expect(() => life.damage(amount)).toThrow(RangeError);
      expect(() => life.heal(amount)).toThrow(RangeError);
    }
    expect(life.step(NaN)).toEqual({ respawnReady: false, regenerated: 0 });
    expect(life.step(-1)).toEqual({ respawnReady: false, regenerated: 0 });
    expect(life.health).toBe(COMBAT.maxHealth);
    expect(() => new Vitality({ ...COMBAT, maxHealth: Infinity })).toThrow(RangeError);
    expect(() => new Vitality({ ...COMBAT, regenerationPerSecond: -1 })).toThrow(RangeError);
  });
});
