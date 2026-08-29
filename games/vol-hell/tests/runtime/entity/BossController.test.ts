import { describe, expect, it, vi } from 'vitest';
import { StatBlock, createRandom } from '@volstudio/core';
import type { HellStat, HellStatBlock } from '@/config/stats';
import { bossConfig } from '@/config/boss';
import { getEnemyDefinition } from '@/config/enemies/catalog';
import { computeBossScaling, scaleBossStats } from '@/runtime/entity/bossScaling';
import { BossController } from '@/runtime/entity/BossController';
import { EliteController } from '@/runtime/entity/EliteController';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { TelegraphManager } from '@/runtime/systems/TelegraphManager';

function makePlayerStats(speed: number): HellStatBlock {
  const stats = new StatBlock<HellStat>({ damage: 22, speed: 220, health: 100, fireRate: 260 });
  stats.addModifier({ id: 'speed', stat: 'speed', type: 'multiply', value: speed / 220 });
  return stats;
}

function makeController(stats: HellStatBlock): BossController {
  const definition = getEnemyDefinition('sovereign');
  const enemy = {
    isAlive: true,
    definition,
    getStats: () => stats,
  } as unknown as Enemy;

  return new BossController(enemy, definition, {
    effects: { play: vi.fn() } as unknown as EffectManager,
    telegraphs: {} as TelegraphManager,
    random: createRandom(1),
    damagePlayer: vi.fn(),
    getPlayerPosition: () => ({ x: 0, y: 0 }) as never,
    spawnMinions: vi.fn(),
  });
}

describe('BossController saldırı temposu', () => {
  it('spawn anındaki ölçeklenmiş fireRate gerçek attack intervali değiştirir', () => {
    const definition = getEnemyDefinition('sovereign');
    const slowStats = scaleBossStats(
      definition.baseStats,
      computeBossScaling(makePlayerStats(220)),
    );
    const fastStats = scaleBossStats(
      definition.baseStats,
      computeBossScaling(makePlayerStats(400)),
    );
    const slow = makeController(slowStats);
    const fast = makeController(fastStats);

    expect(slow.getAttackIntervalMs()).toBeCloseTo(bossConfig.attackIntervalMs, 6);
    expect(fast.getAttackIntervalMs()).toBeLessThan(slow.getAttackIntervalMs());
  });

  it('destroy sonrası update ve isAlive artık bossu canlı saymaz', () => {
    const definition = getEnemyDefinition('sovereign');
    const controller = makeController(new StatBlock(definition.baseStats));

    controller.destroy();

    expect(controller.isAlive).toBe(false);
    expect(() =>
      controller.update(1000, { x: 0, y: 0 } as never, {} as never, {} as never),
    ).not.toThrow();
  });
});

describe('EliteController yaşam döngüsü', () => {
  it('destroy sonrası elite canlı sayılmaz ve update no-op olur', () => {
    const definition = getEnemyDefinition('warden');
    const enemy = {
      isAlive: true,
      definition,
    } as unknown as Enemy;
    const controller = new EliteController(enemy, definition, {
      effects: { play: vi.fn() } as unknown as EffectManager,
      telegraphs: {} as TelegraphManager,
      random: createRandom(2),
      spawnMinions: vi.fn(),
    });

    controller.destroy();

    expect(controller.isAlive).toBe(false);
    expect(() =>
      controller.update(1000, { x: 0, y: 0 } as never, {} as never, {} as never),
    ).not.toThrow();
  });
});
