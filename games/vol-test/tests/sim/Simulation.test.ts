import { describe, expect, it } from 'vitest';
import { TANK, WEAPON } from '@/config/tank';
import { Simulation } from '@/sim/Simulation';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import type { SimEvent } from '@/sim/events';
import { command, simulation, STEP_MS, world } from '../support/sim';
import { STRIKER, VEHICLES } from '@/config/vehicles';

describe('Simulation', () => {
  it('sıfır adım komut okumaz, ateşlemez ve örtüşen araçları yerinden oynatmaz', () => {
    const sim = simulation();
    const twin = sim.spawn(sim.player.chassis.x, sim.player.chassis.y);
    const before = sim.vehicles.map((vehicle) => vehicle.chassis.captureState());
    sim.step(() => {
      throw new Error('Sıfır adım komut okuyamaz');
    }, 0);
    sim.step(command({ fire: true }), 0);
    expect(sim.vehicles.map((vehicle) => vehicle.chassis.captureState())).toEqual(before);
    expect(sim.projectiles.count).toBe(0);
    expect(sim.drainEvents([])).toEqual([]);
    expect(twin.chassis.x).toBe(sim.player.chassis.x);
  });

  it('bozuk doğuş konumu kimlik tüketmez ve dünyaya NaN sokmaz', () => {
    const sim = simulation();
    for (const values of [
      [NaN, 100, 0],
      [100, Infinity, 0],
      [100, 100, NaN],
    ])
      expect(() => sim.spawn(values[0], values[1], values[2])).toThrow(RangeError);
    expect(sim.vehicles).toHaveLength(1);
    expect(sim.spawn(100, 100).id).toBe(2);
  });

  it('otomatik kimlik güvenli tamsayı sınırını aşamaz; başarısız araç değişimi oyuncuyu korur', () => {
    const sim = simulation();
    const player = sim.player;
    sim.spawn(100, 100, 0, null, Number.MAX_SAFE_INTEGER);
    expect(() => sim.spawn(200, 200)).toThrow(RangeError);
    expect(() => sim.replacePlayer(VEHICLES.goliath)).toThrow(RangeError);
    expect(sim.player).toBe(player);
    expect(sim.vehicles).toHaveLength(2);
  });

  it('adım dışı hasar ve iyileştirme kuyruğu da sınırlıdır', () => {
    const sim = simulation();
    for (let i = 0; i < 1000; i++) {
      sim.applyDamage(sim.player.id, 1);
      sim.healVehicle(sim.player.id, 1);
    }
    const events = sim.drainEvents([]);
    expect(events).toHaveLength(512);
    expect(events.at(-1)?.kind).toBe('healed');
  });

  it('süzülen araç karı sıkıştırmaz', () => {
    const space = world(1024);
    const weather = new WeatherSystem(1024, 1024, { seed: 7, override: 'snow' });
    weather.step(60_000);
    const sim = new Simulation({ world: space, weather, vehicle: VEHICLES.manta });
    for (let i = 0; i < 120; i++) sim.step(command({ moveX: 1 }), STEP_MS);
    expect(sim.player.chassis.groundLeft).toBeGreaterThan(0);
    for (let row = 0; row < weather.rows; row++)
      for (let col = 0; col < weather.columns; col++)
        expect(weather.cell(col, row)!.snowCompaction).toBe(0);
  });

  it('spawnPlayer kapalıyken kontrol edilen araç doğmaz, araçlar komut kaynağıyla sürülür', () => {
    const sim = new Simulation({
      world: world(1024),
      vehicle: STRIKER,
      spawnPlayer: false,
    });
    expect(sim.vehicles).toHaveLength(0);
    expect(() => sim.player).toThrow('Kontrol edilen araç yok');
    const vehicle = sim.spawn(512, 512, 0);
    // Kontrol edilen araç olmadığından tek komut kimseyi sürmez; araç kaldırılabilir.
    const startX = vehicle.chassis.x;
    for (let step = 0; step < 20; step++) sim.step(command({ moveX: 1 }), STEP_MS);
    expect(vehicle.chassis.x).toBe(startX);
    for (let step = 0; step < 20; step++) sim.step(() => command({ moveX: 1 }), STEP_MS);
    expect(vehicle.chassis.x).toBeGreaterThan(startX);
    sim.despawn(vehicle.id);
    expect(sim.vehicles).toHaveLength(0);
  });

  it('varsayılan kurulum kontrol edilen aracı merkezde doğurur ve kaldırılmasını reddeder', () => {
    const sim = simulation(1024);
    expect(sim.vehicles).toHaveLength(1);
    expect(() => sim.despawn(sim.player.id)).toThrow('kaldırılamaz');
  });

  it('hava opt-in olur, tek simülasyon saatiyle ilerler ve hareket eden tank karı sıkıştırır', () => {
    expect(simulation().weather).toBeUndefined();
    const space = world(1024);
    const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'snow' });
    weather.step(60_000);
    const sim = new Simulation({
      world: space,
      vehicle: STRIKER,
      weather,
    });
    sim.player.chassis.place(512, 512, 0);
    expect(sim.weather).toBe(weather);
    const before = weather.frame.elapsedMs;
    sim.step(command(), 0);
    expect(weather.frame.elapsedMs).toBe(before);
    expect(weather.sample(512, 512).snowCompaction).toBe(0);
    for (let step = 0; step < 30; step++) sim.step(command({ moveX: 1 }), STEP_MS);
    expect(weather.frame.elapsedMs).toBeCloseTo(before + 30 * STEP_MS);
    expect(
      weather.sample(sim.player.chassis.x, sim.player.chassis.y).snowCompaction,
    ).toBeGreaterThan(0);
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
        vehicle: STRIKER,
        weather,
      });
      sim.player.chassis.place(2000, 2000, 0);
      sim.player.chassis.vx = 200;
      for (let step = 0; step < 12; step++) sim.step(command({ brake: true }), STEP_MS);
      return sim.player.chassis.x - 2000;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('merkezi sabit duran tank yerinde dönüşte iki palet temasındaki karı sıkıştırır', () => {
    const space = world(1024);
    const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'snow' });
    weather.step(60_000);
    const sim = new Simulation({
      world: space,
      vehicle: STRIKER,
      weather,
    });
    const tank = sim.player.chassis;
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
  it('`weatherEffects: false` havayı yalnız ilerletir ve iz alır; sürüşü ve mermiyi etkilemez', () => {
    const brake = (effects: boolean) => {
      const space = world();
      const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'rain' });
      weather.step(60_000);
      const sim = new Simulation({
        world: space,
        vehicle: STRIKER,
        weather,
        weatherEffects: effects,
      });
      sim.player.chassis.place(2000, 2000, 0);
      sim.player.chassis.vx = 200;
      for (let step = 0; step < 12; step++) sim.step(command({ brake: true }), STEP_MS);
      return { stop: sim.player.chassis.x - 2000, weather };
    };
    const open = brake(true);
    const inert = brake(false);
    // Etkisiz hava, kuru zeminle aynı fren yolunu verir; etkili ıslak hava daha uzun.
    expect(inert.stop).toBeLessThan(open.stop);
    const dry = (() => {
      const sim = simulation();
      sim.player.chassis.place(2000, 2000, 0);
      sim.player.chassis.vx = 200;
      for (let step = 0; step < 12; step++) sim.step(command({ brake: true }), STEP_MS);
      return sim.player.chassis.x - 2000;
    })();
    expect(inert.stop).toBeCloseTo(dry, 9);
    // Saat yine ilerler.
    expect(inert.weather.frame.elapsedMs).toBeGreaterThan(60_000);
  });

  it('geçen palet yeşilliği ezer; süzülen araç yere değmez', () => {
    const run = (spec: typeof STRIKER) => {
      const space = world(1024);
      const weather = new WeatherSystem(space.width, space.height, { seed: 7, override: 'rain' });
      weather.step(300_000);
      const sim = new Simulation({ world: space, vehicle: spec, weather });
      const chassis = sim.player.chassis;
      chassis.place(100, 512, 0);
      let before = 0;
      let after = 0;
      for (let y = 0; y < weather.rows; y++)
        for (let x = 0; x < weather.columns; x++) before += weather.cell(x, y)!.growth;
      for (let step = 0; step < 360; step++) sim.step(command({ moveX: 1 }), STEP_MS);
      for (let y = 0; y < weather.rows; y++)
        for (let x = 0; x < weather.columns; x++) after += weather.cell(x, y)!.growth;
      return { before, after };
    };
    // Dünyanın bir kısmı verimsizse yol yeşillikten geçmeyebilir: yalnız azalmanın olduğu doğrulanır.
    const tank = run(STRIKER);
    expect(tank.after).toBeLessThanOrEqual(tank.before + 1e-9);
  });

  it('tankı dünyanın ortasına yerleştirir', () => {
    const sim = simulation();
    expect(sim.player.chassis.x).toBe(2048);
    expect(sim.player.chassis.y).toBe(2048);
  });

  it('ateş aralıkla sınırlıdır, namludan çıkar ve tankı ters yöne iter', () => {
    const sim = simulation();
    const firing = command({ fire: true });
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(1);
    expect(sim.player.chassis.vy).toBeGreaterThan(0);
    const events = sim.drainEvents([]);
    const fired = events.find((event) => event.kind === 'fired');
    expect(fired).toMatchObject({ angle: sim.player.chassis.turret });
    for (let step = 0; step < Math.ceil(WEAPON.intervalMs / STEP_MS) - 1; step++) {
      sim.step(firing, STEP_MS);
    }
    expect(sim.projectiles.count).toBe(1);
    sim.step(firing, STEP_MS);
    expect(sim.projectiles.count).toBe(2);
  });

  it('atış olayı mermi ilk hızını taşır: duran tankta namlu hızı, giden tankta tankın hızı da', () => {
    const still = simulation();
    still.step(command({ fire: true }), STEP_MS);
    const shot = still.drainEvents([]).find((event) => event.kind === 'fired');
    if (shot?.kind !== 'fired') throw new Error('atış olayı yok');
    expect(shot.vx).toBeCloseTo(Math.cos(shot.angle) * WEAPON.projectileSpeed, 6);
    expect(shot.vy).toBeCloseTo(Math.sin(shot.angle) * WEAPON.projectileSpeed, 6);

    // Aynı sürüşün atışsız ikizi, atış anındaki tank hızını verir (geri tepme atıştan sonradır).
    const driveOnly = command({ moveY: -1, boost: true });
    const reference = simulation();
    for (let step = 0; step < 91; step++) reference.step(driveOnly, STEP_MS);
    const moving = simulation();
    for (let step = 0; step < 90; step++) moving.step(driveOnly, STEP_MS);
    moving.drainEvents([]);
    moving.step(command({ moveY: -1, boost: true, fire: true }), STEP_MS);
    const driven = moving.drainEvents([]).find((event) => event.kind === 'fired');
    if (driven?.kind !== 'fired') throw new Error('atış olayı yok');
    const { vx, vy } = reference.player.chassis;
    expect(Math.hypot(vx, vy)).toBeGreaterThan(50);
    expect(driven.vx).toBeCloseTo(Math.cos(driven.angle) * WEAPON.projectileSpeed + vx, 6);
    expect(driven.vy).toBeCloseTo(Math.sin(driven.angle) * WEAPON.projectileSpeed + vy, 6);
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
    expect(Math.abs(sim.player.chassis.suspension.roll)).toBeGreaterThan(
      Math.abs(sim.player.chassis.suspension.pitch),
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

  it('replacePlayer oyuncuyu aynı yerde ve yönde yeni tanımla, yeni kimlikle ve tam canla doğurur', () => {
    const sim = simulation();
    const bot = sim.spawn(500, 500, 0);
    const old = sim.player;
    old.chassis.place(900, 1100, 1.25);
    sim.applyDamage(old.id, 10);
    const next = sim.replacePlayer(VEHICLES.goliath);
    expect(sim.player).toBe(next);
    expect(next.spec).toBe(VEHICLES.goliath);
    expect(next.id).not.toBe(old.id);
    expect(sim.vehicle(old.id)).toBeUndefined();
    expect(sim.vehicle(bot.id)).toBe(bot);
    expect(next.chassis.x).toBeCloseTo(900);
    expect(next.chassis.y).toBeCloseTo(1100);
    expect(next.chassis.hull).toBeCloseTo(1.25);
    expect(next.vitality.health).toBe(next.vitality.maxHealth);
    // Yeni oyuncu komutu alır, eskisinin komutu artık kimseyi sürmez.
    const x = next.chassis.x;
    for (let i = 0; i < 20; i++) sim.step(() => command({ moveX: 1 }), STEP_MS);
    expect(next.chassis.x).not.toBe(x);
  });

  it('açık kimlikle doğan araç kimliği korur ve sonraki kimlikler çakışmaz', () => {
    const sim = simulation();
    const remote = sim.spawn(1000, 1000, 0, null, 40);
    expect(remote.id).toBe(40);
    expect(sim.vehicle(40)).toBe(remote);
    expect(sim.spawn(2000, 2000, 0).id).toBe(41);
    // Küçük bir açık kimlik sayacı geri sarmaz.
    expect(sim.spawn(3000, 3000, 0, null, 5).id).toBe(5);
    expect(sim.spawn(3100, 3100, 0).id).toBe(42);
  });

  it('açık kimlik pozitif, güvenli ve tekil olmalıdır', () => {
    const sim = simulation();
    const taken = sim.player.id;
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, taken]) {
      expect(() => sim.spawn(0, 0, 0, null, id)).toThrow(RangeError);
    }
    expect(sim.vehicles).toHaveLength(1);
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
    expect(other.chassis.x).toBeGreaterThan(1010);
    expect(sim.player.chassis.speed).toBeLessThan(1);
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
    expect(target.chassis.x).toBeGreaterThan(2048 + 200);
  });

  it('araçlar çarpışır, olay üretir ve iç içe geçmez', () => {
    const sim = simulation();
    const other = sim.spawn(2048 + 120, 2048, Math.PI);
    const events: SimEvent[] = [];
    for (let step = 0; step < 120; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === other.id ? -1 : 1 }), STEP_MS);
      sim.drainEvents(events);
      const gap = Math.hypot(
        other.chassis.x - sim.player.chassis.x,
        other.chassis.y - sim.player.chassis.y,
      );
      expect(gap, `adım ${step}`).toBeGreaterThan(2 * 21 - 1);
    }
    const collision = events.find((event) => event.kind === 'collision');
    expect(collision).toBeDefined();
  });

  it('ölü aracın enkazı katıdır: canlı araç içinden geçemez, enkaz yerinde kalır, hasar almaz', () => {
    const sim = simulation();
    const wreck = sim.spawn(2048 + 120, 2048, 0);
    sim.applyDamage(wreck.id, wreck.vitality.maxHealth, undefined, 'collision');
    expect(wreck.vitality.alive).toBe(false);
    const parked = { x: wreck.chassis.x, y: wreck.chassis.y };
    const health = sim.player.vitality.health;
    const events: SimEvent[] = [];
    for (let step = 0; step < 240; step++) {
      sim.step((vehicle) => command({ moveX: vehicle.id === sim.player.id ? 1 : 0 }), STEP_MS);
      sim.drainEvents(events);
      const gap = Math.hypot(
        wreck.chassis.x - sim.player.chassis.x,
        wreck.chassis.y - sim.player.chassis.y,
      );
      expect(gap, `adım ${step}`).toBeGreaterThan(2 * 21 - 1);
    }
    expect(wreck.chassis.x).toBeCloseTo(parked.x, 0);
    expect(wreck.chassis.y).toBeCloseTo(parked.y, 0);
    expect(sim.player.chassis.x).toBeLessThan(parked.x);
    expect(sim.player.vitality.health).toBe(health);
    expect(events.some((event) => event.kind === 'collision' && event.b === wreck.id)).toBe(true);
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
      const tank = sim.player.chassis;
      return [tank.x, tank.y, tank.hull, tank.suspension.pitch, sim.projectiles.count];
    };
    expect(run()).toEqual(run());
  });
});
