import { describe, expect, it } from 'vitest';
import { WEAPON } from '@/config/tank';
import { Projectiles, type ProjectileTarget } from '@/sim/combat/Projectiles';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS, world } from '../../support/sim';

describe('merminin ilk dünya sınırı teması (B27)', () => {
  it.each([
    { name: 'sağ', x: 995, y: 500, vx: 600, vy: 600, wantX: 1000, wantY: 505 },
    { name: 'sol', x: 5, y: 500, vx: -600, vy: 600, wantX: 0, wantY: 505 },
    { name: 'alt', x: 500, y: 995, vx: 600, vy: 600, wantX: 505, wantY: 1000 },
    { name: 'üst', x: 500, y: 5, vx: 600, vy: -600, wantX: 505, wantY: 0 },
    { name: 'köşe', x: 995, y: 995, vx: 600, vy: 600, wantX: 1000, wantY: 1000 },
    { name: 'sınırdan dışarı', x: 1000, y: 500, vx: 600, vy: 600, wantX: 1000, wantY: 500 },
    { name: 'sınır dışında namlu', x: 1010, y: 500, vx: 600, vy: 600, wantX: 1000, wantY: 500 },
  ])('$name: runtime ve önizleme bağımsız beklenen temas noktasını taşır', (fixture) => {
    const projectiles = new Projectiles(2, 5000);
    const space = world(1000);
    const { x, y, vx, vy, wantX, wantY } = fixture;
    const preview = { ...projectiles.preview(1, x, y, vx, vy, space, [], 100) };
    projectiles.spawn(1, x, y, vx, vy);
    const events: SimEvent[] = [];
    projectiles.step(100, space, events);
    expect(events).toEqual([
      expect.objectContaining({ kind: 'impact', surface: 'wall', x: wantX, y: wantY }),
    ]);
    expect(preview).toMatchObject({ surface: 'wall', targetId: null });
    expect(preview.x).toBeCloseTo(wantX, 9);
    expect(preview.y).toBeCloseTo(wantY, 9);
    expect(projectiles.count).toBe(0);
  });

  it('sınırdan içeri uçuşu duvar isabeti saymaz', () => {
    const projectiles = new Projectiles(2, 5000);
    projectiles.spawn(1, 1000, 500, -600, 600);
    const events: SimEvent[] = [];
    projectiles.step(100, world(1000), events);
    expect(events).toEqual([]);
    expect(projectiles.count).toBe(1);
    expect(projectiles.items[0]).toMatchObject({ x: 940, y: 560 });
  });

  it('duvardan sonraki hedefi vurmaz; duvardan önceki hedef ilk teması kazanır', () => {
    const targetAt = (edge: number): ProjectileTarget => ({
      id: 2,
      entryT(startX, _startY, endX) {
        const t = (edge - startX) / (endX - startX);
        return t >= 0 && t <= 1 ? t : null;
      },
    });
    for (const edge of [998, 1005]) {
      const projectiles = new Projectiles(2, 5000);
      const targets = [targetAt(edge)];
      const preview = { ...projectiles.preview(1, 995, 500, 600, 600, world(1000), targets, 100) };
      projectiles.spawn(1, 995, 500, 600, 600);
      const events: SimEvent[] = [];
      projectiles.step(100, world(1000), events, targets);
      expect(events[0]).toMatchObject(
        edge === 998
          ? { kind: 'hit', target: 2, x: 998, y: 503 }
          : { kind: 'impact', surface: 'wall', x: 1000, y: 505 },
      );
      expect(preview).toMatchObject(
        edge === 998
          ? { surface: 'vehicle', targetId: 2, x: 998, y: 503 }
          : { surface: 'wall', targetId: null, x: 1000, y: 505 },
      );
    }
  });

  it('gerçek uçuş konfigürasyonunda çapraz ilk teması hesaplar', () => {
    const projectiles = new Projectiles(2, WEAPON.projectileLifeMs, WEAPON.flight);
    projectiles.spawn(1, 995, 500, 900 * Math.SQRT1_2, 900 * Math.SQRT1_2);
    const events: SimEvent[] = [];
    projectiles.step(STEP_MS, world(1000), events);
    expect(events[0]).toMatchObject({ kind: 'impact', surface: 'wall' });
    expect((events[0] as { x: number }).x).toBeCloseTo(1000, 9);
    expect((events[0] as { y: number }).y).toBeCloseTo(505, 9);
  });

  it('gerçek tankın namlu çıkışı, patlama ve nişan önizlemesi aynı ilk duvarı görür', () => {
    const sim = simulation(1000);
    sim.player.tank.place(974, 500, 0);
    const aim = command({ aimX: 1, aimY: 1 });
    for (let step = 0; step < 20; step++) sim.step(aim, STEP_MS);
    const preview = { ...sim.previewAim(sim.player, STEP_MS) };
    sim.step({ ...aim, fire: true }, STEP_MS);
    const events: SimEvent[] = [];
    sim.drainEvents(events);
    const impact = events.find((event) => event.kind === 'impact');
    expect(impact).toMatchObject({ kind: 'impact', surface: 'wall' });
    expect((impact as { x: number }).x).toBeCloseTo(1000, 8);
    expect((impact as { y: number }).y).toBeCloseTo(526, 8);
    expect(preview).toMatchObject({ surface: 'wall' });
    expect(preview.x).toBeCloseTo(1000, 8);
    expect(preview.y).toBeCloseTo(526, 8);
  });
});
