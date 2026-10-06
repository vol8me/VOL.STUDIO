import { describe, expect, it } from 'vitest';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Projectiles, type ProjectileTarget } from '@/sim/combat/Projectiles';
import type { SimEvent } from '@/sim/events';
import { Vehicle } from '@/sim/entities/Vehicle';
import type { Tank } from '@/sim/tank/Tank';
import { simulation, STEP_MS, tank, world } from '../../support/sim';

const DIAGONAL = Math.PI / 4;
/** Gövdenin en uzak köşesinin ekseninden uzaklığı: 45°de en üst köşe. */
const CORNER_X = (TANK.halfLength - TANK.halfWidth) * Math.SQRT1_2;
const CORNER_Y = (TANK.halfLength + TANK.halfWidth) * Math.SQRT1_2;

/** Gerçek araç: hedef sözleşmesini (`entryT`) üretimdeki `Vehicle` sağlar. */
function target(id: number, body: Tank): ProjectileTarget {
  const vehicle = new Vehicle(id, TANK, SUSPENSION, WEAPON);
  vehicle.tank.place(body.x, body.y, body.angle);
  return vehicle;
}

/** B17'nin eski modeli: yalnız yol ortası ve uç noktası örneklenir. */
function sampledOnly(body: Tank, from: [number, number], to: [number, number]): boolean {
  const inside = (x: number, y: number) => {
    const dx = x - body.x;
    const dy = y - body.y;
    return (
      Math.abs(dx * Math.cos(body.angle) + dy * Math.sin(body.angle)) <= TANK.halfLength &&
      Math.abs(-dx * Math.sin(body.angle) + dy * Math.cos(body.angle)) <= TANK.halfWidth
    );
  };
  return inside((from[0] + to[0]) / 2, (from[1] + to[1]) / 2) || inside(to[0], to[1]);
}

/**
 * 45° dönmüş gövdenin üst köşesi, y=500 doğrusunun `depth` birim üstüne
 * çıkar; kiriş genişliği 2·depth olur ve x=`chordCenter` etrafındadır.
 */
function cornerClipped(chordCenter: number, depth: number): Tank {
  return tank({
    x: chordCenter - CORNER_X,
    y: 500 + depth - CORNER_Y,
    hull: DIAGONAL,
  });
}

describe('mermi süpürmesi (B17)', () => {
  it('döndürülmüş gövdenin köşe kirişini yakalar; eski orta/uç örneği ıskalardı', () => {
    const body = cornerClipped(1003, 2);
    const projectiles = new Projectiles(4, 5000);
    const shell = projectiles.spawn(1, 1000, 500, 900, 0);
    const dtMs = 1000 / 60;
    const events: SimEvent[] = [];
    const hits: number[] = [];

    expect(sampledOnly(body, [1000, 500], [1000 + 900 * (dtMs / 1000), 500])).toBe(false);
    projectiles.step(dtMs, world(), events, [target(2, body)], (_, hit) => hits.push(hit.id));

    expect(hits).toEqual([2]);
    expect(projectiles.count).toBe(0);
    expect(events).toEqual([expect.objectContaining({ kind: 'hit', owner: 1, target: 2 })]);
    // Olay ve itki adımın bittiği yeri değil ilk teması taşır: kirişin başı.
    expect(shell.x).toBeCloseTo(1001, 9);
    expect(events[0]).toMatchObject({ y: 500 });
    expect((events[0] as { x: number }).x).toBeCloseTo(1001, 9);
  });

  it('köşeyi sıyıran kiriş isabet eder; bir kiriş genişliği kadar uzaktan geçen ıskalar', () => {
    const run = (depth: number) => {
      const projectiles = new Projectiles(2, 5000);
      projectiles.spawn(1, 1000, 500, 900, 0);
      const hits: number[] = [];
      projectiles.step(1000 / 60, world(), [], [target(2, cornerClipped(1003, depth))], (_, t) =>
        hits.push(t.id),
      );
      return hits;
    };
    expect(run(0.5)).toEqual([2]);
    expect(run(1e-6)).toEqual([2]);
    expect(run(-0.5)).toEqual([]);
  });

  it('çok hızlı mermi tek adımda bütün gövdeyi aşamaz', () => {
    const body = tank({ x: 1500, y: 500, hull: DIAGONAL });
    const projectiles = new Projectiles(2, 5000);
    projectiles.spawn(1, 1000, 500, 90_000, 0);
    const hits: number[] = [];
    projectiles.step(1000 / 60, world(), [], [target(2, body)], (_, t) => hits.push(t.id));
    expect(hits).toEqual([2]);
  });

  it('sahibine isabet etmez; başka aracın içinde doğan mermi ilk adımda vurur', () => {
    const own = tank({ x: 1000, y: 500, hull: 0 });
    const other = tank({ x: 1020, y: 500, hull: 0 });
    const projectiles = new Projectiles(2, 5000);
    const hits: number[] = [];
    projectiles.spawn(1, 1000, 500, 0, 0);
    projectiles.step(1000 / 60, world(), [], [target(1, own)], (_, t) => hits.push(t.id));
    expect(hits).toEqual([]);
    expect(projectiles.count).toBe(1);
    projectiles.step(1000 / 60, world(), [], [target(1, own), target(2, other)], (_, t) =>
      hits.push(t.id),
    );
    expect(hits).toEqual([2]);
  });

  it('aynı adımda birden çok araç kesişirse aday sırasından bağımsız en yakın vurulur', () => {
    const near = tank({ x: 1060, y: 500, hull: 0 });
    const far = tank({ x: 1110, y: 500, hull: 0 });
    for (const order of [
      [target(2, near), target(3, far)],
      [target(3, far), target(2, near)],
    ]) {
      const projectiles = new Projectiles(2, 5000);
      projectiles.spawn(1, 1000, 500, 4000, 0);
      const hits: number[] = [];
      projectiles.step(1000 / 60, world(), [], order, (_, t) => hits.push(t.id));
      expect(hits).toEqual([2]);
    }
  });

  it('önizleme aynı sözleşmeyi kullanır: gerçek mermiyle aynı hedef ve aynı nokta', () => {
    const body = cornerClipped(1003, 2);
    const projectiles = new Projectiles(2, 5000, WEAPON.flight);
    const targets = [target(2, body)];
    const preview = { ...projectiles.preview(1, 1000, 500, 900, 0, world(), targets) };
    const shell = projectiles.spawn(1, 1000, 500, 900, 0);
    const events: SimEvent[] = [];
    for (let step = 0; step < 120 && projectiles.count; step++)
      projectiles.step(STEP_MS, world(), events, targets);

    expect(preview).toMatchObject({ targetId: 2, surface: 'vehicle' });
    expect(events).toEqual([expect.objectContaining({ kind: 'hit', target: 2 })]);
    expect(preview.x).toBeCloseTo(shell.x, 8);
    expect(preview.y).toBeCloseTo(shell.y, 8);
  });

  it('gerçek simülasyon: namludan çıkan mermi köşe kirişini vurur ve itki aracı döndürür', () => {
    const fire = {
      moveX: 0,
      moveY: 0,
      aimX: 1,
      aimY: 0,
      fire: false,
      boost: false,
      brake: false,
    };
    const launch = () => {
      const sim = simulation();
      sim.player.tank.place(500, 500, 0);
      return sim;
    };

    // Düşmansız kayıt: mermi aynı simülasyon kurallarıyla hangi noktalardan geçer?
    const dry = launch();
    const path: Array<[number, number]> = [];
    dry.step({ ...fire, fire: true }, STEP_MS);
    for (let step = 0; step < 14; step++) {
      path.push([dry.projectiles.items[0].x, dry.projectiles.items[0].y]);
      dry.step(fire, STEP_MS);
    }
    const [startX, startY] = path[10];
    const [endX, endY] = path[11];

    // Kiriş bu adım segmentinin başından 1–5 birim ileride; orta ve uç dışarıda.
    const sim = launch();
    const enemy = sim.spawn(0, 0, DIAGONAL);
    enemy.tank.place(startX + 3 - CORNER_X, startY + 2 - CORNER_Y, DIAGONAL);
    expect(sampledOnly(enemy.tank, [startX, startY], [endX, endY])).toBe(false);
    const before = enemy.tank.angularVelocity;
    const events: SimEvent[] = [];
    sim.step({ ...fire, fire: true }, STEP_MS);
    for (let step = 0; step < 14; step++) {
      sim.step(fire, STEP_MS);
      sim.drainEvents(events);
    }
    expect(events.filter((event) => event.kind === 'hit')).toEqual([
      expect.objectContaining({ owner: sim.player.id, target: enemy.id }),
    ]);
    expect(enemy.tank.angularVelocity).not.toBe(before);
    expect(sim.projectiles.count).toBe(0);
  });
});
