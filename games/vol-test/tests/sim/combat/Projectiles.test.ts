import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/config/tank';
import { Projectiles, type ProjectileTarget } from '@/sim/combat/Projectiles';
import type { SimEvent } from '@/sim/events';
import { world } from '../../support/sim';

/** y ekseninden bağımsız dikey şerit: x∈[minX, maxX] aralığına ilk giriş. */
function band(id: number, minX: number, maxX = Infinity): ProjectileTarget {
  return {
    id,
    entryT(startX, _startY, endX) {
      if (startX >= minX && startX <= maxX) return 0;
      const edge = startX < minX ? minX : maxX;
      if (startX === endX) return null;
      const t = (edge - startX) / (endX - startX);
      return t >= 0 && t <= 1 ? t : null;
    },
  };
}

describe('Projectiles', () => {
  it('rüzgâr canlı mermi ve önizlemeyi aynı yere taşır; artan hava direnci menzili kısaltır', () => {
    const run = (windY: number, airDrag: number) => {
      const projectiles = new Projectiles(4, WEAPON.projectileLifeMs, WEAPON.flight);
      projectiles.setAir({ windX: 0, windY, airDrag });
      const space = world();
      const preview = { ...projectiles.preview(1, 1000, 1000, 700, 0, space) };
      const shell = projectiles.spawn(1, 1000, 1000, 700, 0);
      const events: SimEvent[] = [];
      for (let step = 0; step < 100 && projectiles.count; step++)
        projectiles.step(1000 / 60, space, events);
      expect(preview.x).toBeCloseTo(shell.x, 8);
      expect(preview.y).toBeCloseTo(shell.y, 8);
      expect(shell.travelled).toBeLessThanOrEqual(WEAPON.flight.maxRange + 1e-8);
      return shell;
    };
    const calm = run(0, 1);
    const wind = run(200, 1);
    expect(wind.y).toBeGreaterThan(calm.y);
    expect(run(0, 2).x).toBeLessThan(calm.x);
  });

  it('rüzgârlı büyük adım menzili aşmaz ve bozuk hava verisi reddedilir', () => {
    const projectiles = new Projectiles(2, WEAPON.projectileLifeMs, WEAPON.flight);
    projectiles.setAir({ windX: 200, windY: 80, airDrag: 1.2 });
    const shell = projectiles.spawn(1, 100, 100, 1600, 0);
    projectiles.step(1000, world(), []);
    expect(shell.travelled).toBeCloseTo(WEAPON.flight.maxRange, 8);
    expect(projectiles.count).toBe(0);
    for (const air of [
      { windX: NaN, windY: 0, airDrag: 1 },
      { windX: 0, windY: Infinity, airDrag: 1 },
      { windX: 0, windY: 0, airDrag: -1 },
    ])
      expect(() => projectiles.setAir(air)).toThrow(RangeError);
  });
  it('uçuş: mermi yükselir, yerçekimiyle düşer ve hava direnciyle yavaşlar', () => {
    const projectiles = new Projectiles(4, WEAPON.projectileLifeMs, WEAPON.flight);
    const shell = projectiles.spawn(1, 100, 100, 900, 0);
    const events: SimEvent[] = [];
    projectiles.step(200, world(), events);
    expect(shell.height).toBeGreaterThan(WEAPON.flight.muzzleHeight);
    expect(shell.vx).toBeLessThan(900);
    expect(shell.verticalSpeed).toBeLessThan(WEAPON.flight.launchSpeed);
    for (let step = 0; step < 100 && projectiles.count; step++)
      projectiles.step(10, world(), events);
    expect(projectiles.count).toBe(0);
    expect(shell.height).toBe(0);
    expect(events).toEqual([expect.objectContaining({ kind: 'impact', surface: 'ground' })]);
    expect(shell.travelled).toBeGreaterThan(500);
    expect(shell.travelled).toBeLessThanOrEqual(WEAPON.flight.maxRange);
  });

  it('hızlanan tanktan çıkan mermi de menzili aşamaz; büyük adım son noktayı taşırmaz', () => {
    const projectiles = new Projectiles(2, WEAPON.projectileLifeMs, WEAPON.flight);
    const shell = projectiles.spawn(1, 100, 100, 1600, 0);
    const events: SimEvent[] = [];
    projectiles.step(1000, world(), events);
    expect(projectiles.count).toBe(0);
    expect(shell.x).toBeCloseTo(100 + WEAPON.flight.maxRange);
    expect(shell.height).toBe(0);
    expect(shell.travelled).toBeCloseTo(WEAPON.flight.maxRange);
    expect(events[0]).toMatchObject({ kind: 'impact', surface: 'ground' });
    projectiles.spawn(1, 200, 100, 900, 0);
    expect(projectiles.items[0]).toMatchObject({
      ageMs: 0,
      travelled: 0,
      height: WEAPON.flight.muzzleHeight,
    });
  });

  it('nişan önizlemesi gerçek uçuşla aynı yere düşer; canlı havuzu değiştirmez', () => {
    const projectiles = new Projectiles(4, WEAPON.projectileLifeMs, WEAPON.flight);
    const space = world();
    projectiles.spawn(2, 0, 0, 10, 0);
    const liveBefore = structuredClone(projectiles.items);
    const preview = { ...projectiles.preview(1, 100, 200, 900, 0, space) };
    expect(projectiles.items).toEqual(liveBefore);
    expect(projectiles.count).toBe(1);
    const shell = projectiles.spawn(1, 100, 200, 900, 0);
    const events: SimEvent[] = [];
    for (
      let step = 0;
      step < 100 && !events.some((event) => event.kind === 'impact' && event.owner === 1);
      step++
    ) {
      projectiles.step(1000 / 60, space, events);
    }
    expect(preview.x).toBeCloseTo(shell.x, 8);
    expect(preview.y).toBeCloseTo(shell.y, 8);
    expect(preview.surface).toBe('ground');
    expect(projectiles.preview(1, 4000, 200, 900, 0, space).surface).toBe('wall');
  });

  it('önizleme aracı engel olarak gösterir; kendi aracını yok sayar', () => {
    const projectiles = new Projectiles(2, WEAPON.projectileLifeMs, WEAPON.flight);
    const targets = [band(1, -Infinity), band(2, 190, 210)];
    const result = projectiles.preview(1, 100, 100, 900, 0, world(), targets);
    expect(result.targetId).toBe(2);
    expect(result.surface).toBe('vehicle');
    expect(result.x).toBeLessThan(220);
  });

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
    const targets = [band(1, -Infinity), band(2, 150)];
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
