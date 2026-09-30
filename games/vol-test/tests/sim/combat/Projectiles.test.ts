import { describe, expect, it } from 'vitest';
import { Projectiles } from '@/sim/combat/Projectiles';
import type { SimEvent } from '@/sim/events';
import { world } from '../../support/sim';

describe('Projectiles', () => {
  it('geçersiz kapasiteyi reddeder', () => {
    expect(() => new Projectiles(0, 100)).toThrow(RangeError);
  });

  it('mermiyi ilerletir ve önceki konumu tutar', () => {
    const projectiles = new Projectiles(4, 1000);
    projectiles.spawn(1, 100, 100, 600, 0);
    projectiles.step(100, world(), []);
    const projectile = projectiles.items[0];
    expect(projectile.px).toBe(100);
    expect(projectile.x).toBeCloseTo(160);
  });

  it('ömrü dolan mermi menzil sonunda yerde patlar', () => {
    const projectiles = new Projectiles(4, 100);
    projectiles.spawn(1, 100, 100, 10, 0);
    const events: SimEvent[] = [];
    projectiles.step(60, world(), events);
    projectiles.step(60, world(), events);
    expect(projectiles.count).toBe(0);
    expect(events).toEqual([
      expect.objectContaining({ kind: 'impact', surface: 'ground', owner: 1 }),
    ]);
  });

  it('başka aracın ayak izine değen mermi isabet eder; sahibine etmez', () => {
    const projectiles = new Projectiles(4, 5000);
    const targets = [
      { id: 1, contains: () => true },
      { id: 2, contains: (x: number) => x > 150 },
    ];
    const hits: number[] = [];
    const events: SimEvent[] = [];
    projectiles.spawn(1, 100, 100, 900, 0);
    projectiles.step(100, world(), events, targets, (_, target) => hits.push(target.id));
    expect(hits).toEqual([2]);
    expect(events).toEqual([expect.objectContaining({ kind: 'hit', owner: 1, target: 2 })]);
  });

  it('duvarı aşan mermi duvarda isabet olayı üretir', () => {
    const projectiles = new Projectiles(4, 5000);
    const events: SimEvent[] = [];
    projectiles.spawn(1, 1000, 50, 0, -900);
    projectiles.step(100, world(1024), events);
    expect(projectiles.count).toBe(0);
    expect(events).toEqual([
      { kind: 'impact', owner: 1, surface: 'wall', x: 1000, y: 0, angle: -Math.PI / 2 },
    ]);
  });

  it('kapasite dolunca en yaşlı mermiyi yeniden kullanır', () => {
    const projectiles = new Projectiles(2, 5000);
    const space = world();
    const first = projectiles.spawn(1, 10, 10, 1, 0);
    projectiles.step(50, space, []);
    projectiles.spawn(1, 20, 20, 1, 0);
    projectiles.step(10, space, []);
    const reused = projectiles.spawn(1, 30, 30, 1, 0);
    expect(projectiles.count).toBe(2);
    expect(reused).toBe(first);
    expect(reused.ageMs).toBe(0);
  });

  it('ölen mermi yoğun diziden çıkar, diğerleri korunur', () => {
    const projectiles = new Projectiles(4, 5000);
    projectiles.spawn(1, 16, 16, -1000, 0);
    projectiles.spawn(1, 500, 48, 100, 0);
    projectiles.step(100, world(), []);
    expect(projectiles.count).toBe(1);
    expect(projectiles.items[0].y).toBe(48);
    projectiles.clear();
    expect(projectiles.count).toBe(0);
  });
});
