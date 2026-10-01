import { describe, expect, it } from 'vitest';
import { SUSPENSION, TANK, WEAPON } from '@/config/tank';
import { Simulation } from '@/sim/Simulation';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS, world } from '../support/sim';

describe('Simulation', () => {
  it('hava opt-in olur, tek simülasyon saatiyle ilerler ve hareket eden tank karı sıkıştırır', () => {
    expect(simulation().weather).toBeUndefined();
    const space = world(1024);
    const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'snow' });
    weather.step(60_000);
    const sim = new Simulation({
      world: space,
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
      weather,
    });
    sim.player.tank.place(512, 512, 0);
    expect(sim.weather).toBe(weather);
    const before = weather.frame.elapsedMs;
    sim.step(command(), 0);
    expect(weather.frame.elapsedMs).toBe(before);
    expect(weather.sample(512, 512).snowCompaction).toBe(0);
    for (let step = 0; step < 30; step++) sim.step(command({ moveX: 1 }), STEP_MS);
    expect(weather.frame.elapsedMs).toBeCloseTo(before + 30 * STEP_MS);
    expect(weather.sample(sim.player.tank.x, sim.player.tank.y).snowCompaction).toBeGreaterThan(0);
  });

  it('gerçek ıslak zeminde kilitli palet kuru zeminden uzun fren yolu bırakır', () => {
    const run = (wet: boolean) => {
      const space = world();
      const weather = new WeatherSystem(space.width, space.height, {
        seed: 7,
        override: wet ? 'rain' : 'clear',
      });
      weather.step(60_000);
      const sim = new Simulation({
        world: space,
        tank: TANK,
        suspension: SUSPENSION,
        weapon: WEAPON,
        weather,
      });
      sim.player.tank.place(2000, 2000, 0);
      sim.player.tank.vx = 200;
      for (let step = 0; step < 12; step++) sim.step(command({ brake: true }), STEP_MS);
      return sim.player.tank.x - 2000;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('merkezi sabit duran tank yerinde dönüşte iki palet temasındaki karı sıkıştırır', () => {
    const space = world(1024);
    const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'snow' });
    weather.step(60_000);
    const sim = new Simulation({
      world: space,
      tank: TANK,
      suspension: SUSPENSION,
      weapon: WEAPON,
      weather,
    });
    const tank = sim.player.tank;
    tank.place(512, 512, 0);
    for (let step = 0; step < 2; step++) sim.step(command({ moveY: 1 }), STEP_MS);
    expect(tank.x).toBeCloseTo(512, 10);
    expect(tank.y).toBeCloseTo(512, 10);
    expect(tank.hull).toBeGreaterThan(0);
    expect(tank.trackLeft * tank.trackRight).toBeLessThan(0);
    expect(tank.groundLeft).toBeGreaterThan(0);
    expect(tank.groundRight).toBeGreaterThan(0);
    const offsetX = -Math.sin(tank.hull) * TANK.trackOffset;
    const offsetY = Math.cos(tank.hull) * TANK.trackOffset;
    expect(weather.sample(tank.x + offsetX, tank.y + offsetY).snowCompaction).toBeGreaterThan(0);
    expect(weather.sample(tank.x - offsetX, tank.y - offsetY).snowCompaction).toBeGreaterThan(0);
  });
  it('tankı dünyanın ortasına yerleştirir', () => {
    const sim = simulation();
    expect(sim.player.tank.x).toBe(2048);
    expect(sim.player.tank.y).toBe(2048);
  });

  it('ateş aralıkla sınırlıdır, namludan çıkar ve tankı ters yöne iter', () => {
    const sim = simulation();
    const firing = command({ fire: true });
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(1);
    expect(sim.player.tank.vy).toBeGreaterThan(0);
    const events = sim.drainEvents([]);
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ angle: sim.player.tank.turret });
    for (let step = 0; step < Math.ceil(WEAPON.intervalMs / STEP_MS) - 1; step++) {
      sim.step(firing, STEP_MS);
    }
    expect(sim.projectiles.count).toBe(1);
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(2);
  });

  it('nişan değişince hedefe oturmadan ateş etmez ve dolumu tüketmez', () => {
    const sim = simulation();
    const input = command({ aimX: -1, fire: true });
    sim.step(input, STEP_MS);
    expect(sim.projectiles.count).toBe(0);
    expect(sim.player.gun.getProgress()).toBe(1);
    const events: SimEvent[] = [];
    for (let step = 0; step < 60; step++) {
      sim.step(input, STEP_MS);
      sim.drainEvents(events);
    }
    const shots = events.filter((event) => event.kind === 'fired');
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots)
      if (shot.kind === 'fired') {
        expect(Math.abs(Math.abs(shot.angle) - Math.PI)).toBeLessThan(0.04);
      }
  });

  it('ani yön değişimi önceki hizalı nişandan yanlış atış üretmez', () => {
    const sim = simulation();
    sim.step(command({ aimY: -1 }), STEP_MS);
    sim.step(command({ aimY: 1, fire: true }), STEP_MS);
    expect(sim.projectiles.count).toBe(0);
  });

  it('yana ateş gövdeyi yalpalatır', () => {
    const sim = simulation();
    for (let step = 0; step < 60; step++) sim.step(command({ aimX: 1 }), STEP_MS);
    sim.step(command({ aimX: 1, fire: true }), STEP_MS);
    for (let step = 0; step < 3; step++) sim.step(command({ aimX: 1 }), STEP_MS);
    expect(Math.abs(sim.player.tank.suspension.roll)).toBeGreaterThan(
      Math.abs(sim.player.tank.suspension.pitch),
    );
  });

  it('duvar çarpması olay üretir', () => {
    const sim = simulation(1024);
    const events: SimEvent[] = [];
    for (let step = 0; step < 240; step++) {
      sim.step(command({ moveX: 1, boost: true }), STEP_MS);
      sim.drainEvents(events);
    }
    const hit = events.find((event) => event.kind === 'wallHit');
    expect(hit).toMatchObject({ normalX: -1, normalY: 0 });
  });

  it('boşaltılmayan olay kuyruğu sınırlıdır', () => {
    const sim = simulation();
    for (let step = 0; step < 20000; step++) sim.step(command({ fire: true }), STEP_MS);
    expect(sim.drainEvents([]).length).toBeLessThanOrEqual(512);
  });

  it('araçlar kimlikle yönetilir; oyuncu kaldırılamaz', () => {
    const sim = simulation();
    const other = sim.spawn(1000, 1000, 0);
    expect(sim.vehicles.map((vehicle) => vehicle.id)).toEqual([sim.player.id, other.id]);
    expect(sim.vehicle(other.id)).toBe(other);
    expect(() => sim.despawn(sim.player.id)).toThrow();
    sim.despawn(other.id);
    sim.despawn(999);
    expect(sim.vehicles).toHaveLength(1);
    expect(sim.spawn(0, 0).id).toBeGreaterThan(other.id);
  });

  it('bir adımdaki komut kaynağını araç başına bir kez örnekler', () => {
    const sim = simulation();
    sim.spawn(1000, 1000);
    let reads = 0;
    sim.step(() => {
      reads++;
      return command({ fire: reads === 1 });
    }, STEP_MS);
    expect(reads).toBe(2);
    expect(sim.drainEvents([]).filter((event) => event.kind === 'fired')).toHaveLength(1);
  });

  it('komut kaynağı her araca kendi komutunu verir', () => {
    const sim = simulation();
    const other = sim.spawn(1000, 2048, 0);
    for (let step = 0; step < 60; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === other.id ? 1 : 0 }), STEP_MS);
    }
    expect(other.tank.x).toBeGreaterThan(1010);
    expect(sim.player.tank.speed).toBeLessThan(1);
  });

  it('mermi başka araca isabet eder ve onu iter; sahibine isabet etmez', () => {
    const sim = simulation();
    const target = sim.spawn(2048 + 200, 2048, 0);
    const events: SimEvent[] = [];
    for (let step = 0; step < 60; step++) {
      sim.step(
        (vehicle) => command(vehicle.id === sim.player.id ? { aimX: 1, fire: step === 30 } : {}),
        STEP_MS,
      );
      sim.drainEvents(events);
    }
    const hit = events.find((event) => event.kind === 'hit');
    expect(hit).toMatchObject({ owner: sim.player.id, target: target.id });
    expect(target.tank.x).toBeGreaterThan(2048 + 200);
  });

  it('araçlar çarpışır, olay üretir ve iç içe geçmez', () => {
    const sim = simulation();
    const other = sim.spawn(2048 + 120, 2048, Math.PI);
    const events: SimEvent[] = [];
    for (let step = 0; step < 120; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === other.id ? -1 : 1 }), STEP_MS);
      sim.drainEvents(events);
      const gap = Math.hypot(other.tank.x - sim.player.tank.x, other.tank.y - sim.player.tank.y);
      expect(gap, `adım ${step}`).toBeGreaterThan(2 * 21 - 1);
    }
    const collision = events.find((event) => event.kind === 'collision');
    expect(collision).toBeDefined();
  });

  it('aynı komut dizisi aynı sonucu verir', () => {
    const run = () => {
      const sim = simulation();
      for (let step = 0; step < 240; step++) {
        const angle = step * 0.03;
        sim.step(
          command({
            moveX: Math.cos(angle),
            moveY: Math.sin(angle),
            aimX: 1,
            fire: step % 3 === 0,
            boost: step > 60,
          }),
          STEP_MS,
        );
      }
      const tank = sim.player.tank;
      return [tank.x, tank.y, tank.hull, tank.suspension.pitch, sim.projectiles.count];
    };
    expect(run()).toEqual(run());
  });
});
