import { describe, expect, it } from 'vitest';
import type { OutcropSpec } from '@/config/rocks';
import { ROCKS } from '@/config/rocks';
import { ARACHNID, JUGGERNAUT, MANTA, STRIKER, type VehicleSpec } from '@/config/vehicles';
import { Projectiles } from '@/sim/combat/Projectiles';
import { Vehicle } from '@/sim/entities/Vehicle';
import type { SimEvent } from '@/sim/events';
import { World } from '@/sim/world/World';
import { command, DT } from '../support/sim';

/** Tek kayalı küçük sahne: 12288 birimlik dünyanın ortasında tek lob. */
const SPEC: OutcropSpec = { id: 'test', x: 0.5, y: 0.5, radius: 260, lobes: 1, seed: 7 };
const world = new World(12288, 12288, 128, [], [SPEC]);
const rock = world.rocks.rocks[0];
const edge = rock.radius * ROCKS.collisionInset;

function chassisOf(spec: VehicleSpec) {
  const chassis = new Vehicle(1, spec).chassis;
  // Kayanın batısında, tam hizada, doğuya bakan.
  chassis.place(rock.x - rock.radius - 160, rock.y, 0);
  return chassis;
}

/** Doğuya doğru sürer; geçen sürede en büyük `climb` ve en yüksek `x` kaydedilir. */
function drive(spec: VehicleSpec, seconds: number) {
  const chassis = chassisOf(spec);
  const input = command({ moveX: 1, aimX: 1, aimY: 0 });
  let climb = 0;
  let furthest = chassis.x;
  let touched = 0;
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    chassis.capturePose();
    chassis.step(input, world, DT);
    climb = Math.max(climb, chassis.climb);
    furthest = Math.max(furthest, chassis.x);
    touched = Math.max(touched, chassis.contact.speed);
  }
  return { chassis, climb, furthest, touched };
}

describe('kaya ve şasi', () => {
  it('paletli tank kayaya çarpar: yüzeyin ötesine geçemez ve çarpma kaydeder', () => {
    const run = drive(STRIKER, 6);
    expect(run.climb).toBe(0);
    // Ayak izinin önü kaya yüzeyinin ardına geçmez (küçük sekme payı).
    expect(run.furthest + run.chassis.shape.halfLength).toBeLessThan(rock.x - edge + 6);
    expect(run.touched).toBeGreaterThan(0);
  });

  it('süzülen araç ve iki bacaklı mech de kayaya çarpar', () => {
    for (const spec of [MANTA, JUGGERNAUT]) {
      const run = drive(spec, 8);
      expect(run.climb, spec.id).toBe(0);
      expect(run.furthest, spec.id).toBeLessThan(rock.x);
    }
  });

  it('örümcek kayaya tırmanır: geçer, yükseklik hissedilir ve tepede yavaşlar', () => {
    const run = drive(ARACHNID, 9);
    expect(run.climb).toBeGreaterThan(0.5);
    expect(run.furthest).toBeGreaterThan(rock.x + rock.radius);
    // Açık zeminde aynı sürede alınan yol, kayadan geçişin yolundan uzundur.
    const open = new World(12288, 12288, 128);
    const free = new Vehicle(1, ARACHNID).chassis;
    free.place(rock.x - rock.radius - 160, rock.y, 0);
    const input = command({ moveX: 1, aimX: 1, aimY: 0 });
    for (let step = 0; step < Math.round(9 / DT); step++) {
      free.capturePose();
      free.step(input, open, DT);
    }
    expect(free.x).toBeGreaterThan(run.chassis.x);
    expect(free.climb).toBe(0);
  });

  it('tırmanış hız tabanına iner ve kaya dışında sıfırlanır', () => {
    const chassis = new Vehicle(1, ARACHNID).chassis;
    chassis.place(rock.x, rock.y, 0);
    chassis.step(command(), world, DT);
    expect(chassis.climb).toBeGreaterThan(0.3);
    chassis.place(rock.x - rock.radius - 400, rock.y, 0);
    chassis.step(command(), world, DT);
    expect(chassis.climb).toBe(0);
  });

  it('kayaya yaslanan dönük tank sonlu kalır ve kaya içine sızmaz', () => {
    for (const hull of [0.4, 1.9, -2.6, 3.1]) {
      const chassis = new Vehicle(1, STRIKER).chassis;
      chassis.place(rock.x + edge + 40, rock.y + 10, hull);
      const input = command({ moveX: 1 });
      for (let step = 0; step < 240; step++) chassis.step(input, world, DT);
      expect(Number.isFinite(chassis.x) && Number.isFinite(chassis.y)).toBe(true);
      expect(Math.hypot(chassis.x - rock.x, chassis.y - rock.y)).toBeGreaterThan(edge * 0.9);
    }
  });
});

describe('kaya ve mermi', () => {
  const projectiles = () => new Projectiles(4, 3000, STRIKER.armament.weapon.flight);

  it('namlu yüksekliğindeki mermi kayaya çarpar ve olay kayanın yüzeyinde doğar', () => {
    const shots = projectiles();
    shots.spawn(1, rock.x - edge - 120, rock.y, 900, 0);
    const events: SimEvent[] = [];
    for (let step = 0; step < 60 && shots.count > 0; step++) shots.step(1000 / 60, world, events);
    expect(events).toHaveLength(1);
    const impact = events[0] as { kind: string; surface: string; x: number };
    expect(impact).toMatchObject({ kind: 'impact', surface: 'wall' });
    expect(impact.x).toBeGreaterThan(rock.x - edge - 20);
    expect(impact.x).toBeLessThan(rock.x - edge * 0.5);
  });

  it('siper yüksekliğinin üstünden uçan mermi kayayı aşar', () => {
    const shots = new Projectiles(2, 3000, {
      muzzleHeight: rock.height * ROCKS.coverHeight + 40,
      launchSpeed: 0,
      gravity: 1,
      drag: 0,
      maxRange: 4000,
    });
    shots.spawn(1, rock.x - edge - 120, rock.y, 900, 0);
    const events: SimEvent[] = [];
    for (let step = 0; step < 30; step++) shots.step(1000 / 60, world, events);
    expect(events).toEqual([]);
    expect(shots.items[0].x).toBeGreaterThan(rock.x + edge);
  });

  it('nişan önizlemesi kayada biter ve yüzeyi `wall` bildirir', () => {
    const shots = projectiles();
    const preview = shots.preview(1, rock.x - edge - 200, rock.y, 900, 0, world, [], 1000 / 60);
    expect(preview.surface).toBe('wall');
    expect(preview.x).toBeLessThan(rock.x);
  });
});

describe('kaya ve dünya sözleşmesi', () => {
  it('kayasız dünya şasiyi hiç değiştirmez', () => {
    const open = new World(12288, 12288, 128);
    const chassis = new Vehicle(1, STRIKER).chassis;
    chassis.place(rock.x - 400, rock.y, 0);
    for (let step = 0; step < 900; step++) chassis.step(command({ moveX: 1 }), open, DT);
    expect(chassis.x).toBeGreaterThan(rock.x + 200);
  });

  it('kayaya gömülü doğan şasi dışarı çıkar (kutu merkezi kayanın içinde)', () => {
    const chassis = new Vehicle(1, STRIKER).chassis;
    chassis.place(rock.x, rock.y, 0.7);
    for (let step = 0; step < 60; step++) chassis.step(command(), world, DT);
    expect(Math.hypot(chassis.x - rock.x, chassis.y - rock.y)).toBeGreaterThan(edge * 0.9);
  });

  it('kaya sayıları geçerlidir: tırmanış yavaşlatır ama durdurmaz, fizik kenarı görüntüyü aşmaz', () => {
    expect(ROCKS.climb.speedFloor).toBeGreaterThan(0.3);
    expect(ROCKS.climb.speedFloor).toBeLessThan(1);
    expect(ROCKS.collisionInset).toBeLessThanOrEqual(1);
  });
});
