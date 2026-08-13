import { describe, it, expect } from 'vitest';
import { createRandom, STAT_KEYS } from '@volstudio/core';
import {
  ENEMY_CATALOG,
  findEnemies,
  getEnemyDefinition,
  getMaxEnemyRadius,
  pickEnemyDefinition,
} from '@/config/enemies/catalog';
import { waveConfig } from '@/config/wave';

describe('ENEMY_CATALOG bütünlüğü', () => {
  it('her tanımın anahtarı kendi id’si ile aynı', () => {
    for (const [key, definition] of Object.entries(ENEMY_CATALOG)) {
      expect(definition.id, key).toBe(key);
    }
  });

  it('her tanım dört temel stat’ı da taşır ve değerler pozitif', () => {
    for (const [key, definition] of Object.entries(ENEMY_CATALOG)) {
      for (const stat of STAT_KEYS) {
        expect(definition.baseStats[stat], `${key}.${stat}`).toBeGreaterThan(0);
      }
    }
  });

  it('her tanımın görünüm ve ödül alanları geçerli', () => {
    for (const [key, definition] of Object.entries(ENEMY_CATALOG)) {
      expect(definition.radius, key).toBeGreaterThan(0);
      expect(definition.scoreValue, key).toBeGreaterThan(0);
      expect(definition.sparkReward, key).toBeGreaterThan(0);
      expect(definition.fluxReward, key).toBeGreaterThanOrEqual(0);
      expect(definition.minWave, key).toBeGreaterThanOrEqual(1);
      expect(definition.spawnWeight, key).toBeGreaterThanOrEqual(0);
      expect(definition.tags.length, key).toBeGreaterThan(0);
      expect(definition.displayName.length, key).toBeGreaterThan(0);
    }
  });

  it('arketipe özel parametreler eksiksiz', () => {
    for (const [key, definition] of Object.entries(ENEMY_CATALOG)) {
      if (definition.archetype === 'rusher') {
        expect(definition.rusher, key).toBeDefined();
        expect(definition.rusher!.dashSpeedMultiplier, key).toBeGreaterThan(1);
        expect(definition.rusher!.triggerDistance, key).toBeGreaterThan(0);
        expect(definition.rusher!.cooldownMs, key).toBeGreaterThan(0);
      }
      if (definition.archetype === 'swarmer') {
        expect(definition.swarmer, key).toBeDefined();
        expect(definition.swarmer!.maxMinions, key).toBeGreaterThan(0);
        expect(definition.swarmer!.spawnCount, key).toBeGreaterThan(0);
        // Doğurulan minion katalogda TANIMLI olmalı, yoksa spawn çöker.
        expect(ENEMY_CATALOG[definition.swarmer!.minionId], key).toBeDefined();
      }
    }
  });

  it('üç arketipin de en az bir tanımı var', () => {
    expect(findEnemies({ archetype: 'base' }).length).toBeGreaterThan(0);
    expect(findEnemies({ archetype: 'rusher' }).length).toBeGreaterThan(0);
    expect(findEnemies({ archetype: 'swarmer' }).length).toBeGreaterThan(0);
  });

  it('minion doğrudan spawn havuzuna girmez', () => {
    expect(findEnemies({ spawnableOnly: true })).not.toContain('swarmling');
    expect(ENEMY_CATALOG.swarmling.spawnWeight).toBe(0);
  });

  it('koşunun son dalgasında tüm arketipler havuzda', () => {
    const lateWave = findEnemies({ wave: waveConfig.totalWaves, spawnableOnly: true });
    const archetypes = new Set(lateWave.map((id) => ENEMY_CATALOG[id].archetype));
    expect(archetypes.has('base')).toBe(true);
    expect(archetypes.has('rusher')).toBe(true);
    expect(archetypes.has('swarmer')).toBe(true);
  });
});

describe('findEnemies', () => {
  it('arketip filtresi yalnızca o arketipi döner', () => {
    for (const id of findEnemies({ archetype: 'rusher' })) {
      expect(ENEMY_CATALOG[id].archetype).toBe('rusher');
    }
  });

  it('tag filtresi herhangi bir etiket eşleşmesinde döner', () => {
    const minions = findEnemies({ tags: ['minion'] });
    expect(minions).toContain('swarmling');
    expect(minions).not.toContain('grunt');
  });

  it('dalga filtresi henüz açılmamış türleri eler', () => {
    const firstWave = findEnemies({ wave: 1, spawnableOnly: true });
    expect(firstWave).toContain('grunt');
    expect(firstWave).not.toContain('lancer');

    const laterWave = findEnemies({ wave: ENEMY_CATALOG.lancer.minWave, spawnableOnly: true });
    expect(laterWave).toContain('lancer');
  });

  it('sorgu alanları birlikte (AND) uygulanır', () => {
    const result = findEnemies({ archetype: 'base', tags: ['minion'] });
    expect(result).toEqual(['swarmling']);
  });

  it('boş sorgu tüm katalogu döner', () => {
    expect(findEnemies()).toHaveLength(Object.keys(ENEMY_CATALOG).length);
  });
});

describe('pickEnemyDefinition', () => {
  it('aynı seed aynı diziyi verir — determinizm korunur', () => {
    const first = Array.from({ length: 20 }, () => 0);
    const randomA = createRandom(42);
    const randomB = createRandom(42);

    for (let i = 0; i < first.length; i++) {
      const a = pickEnemyDefinition(randomA, 10);
      const b = pickEnemyDefinition(randomB, 10);
      expect(a?.id).toBe(b?.id);
    }
  });

  it('yalnızca o dalgada açık olan türleri seçer', () => {
    const random = createRandom(7);
    for (let i = 0; i < 50; i++) {
      const picked = pickEnemyDefinition(random, 1);
      expect(picked).not.toBeNull();
      expect(picked!.minWave).toBeLessThanOrEqual(1);
      expect(picked!.spawnWeight).toBeGreaterThan(0);
    }
  });

  it('geç dalgada ağırlıklı seçim tüm türleri kapsar', () => {
    const random = createRandom(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(pickEnemyDefinition(random, waveConfig.totalWaves)!.id);
    }
    expect(seen.has('grunt')).toBe(true);
    expect(seen.has('lancer')).toBe(true);
    expect(seen.has('brooder')).toBe(true);
  });

  it('ağırlıklar seçim sıklığına yansır — grunt en sık çıkar', () => {
    const random = createRandom(99);
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const id = pickEnemyDefinition(random, waveConfig.totalWaves)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get('grunt')!).toBeGreaterThan(counts.get('brooder')!);
  });
});

describe('katalog yardımcıları', () => {
  it('getEnemyDefinition bilinen kimliği döner, bilinmeyende hata fırlatır', () => {
    expect(getEnemyDefinition('grunt').id).toBe('grunt');
    expect(() => getEnemyDefinition('yok-boyle-bir-dusman')).toThrow();
  });

  it('getMaxEnemyRadius katalogdaki en büyük yarıçapı verir', () => {
    const max = Math.max(...Object.values(ENEMY_CATALOG).map((d) => d.radius));
    expect(getMaxEnemyRadius()).toBe(max);
  });
});
