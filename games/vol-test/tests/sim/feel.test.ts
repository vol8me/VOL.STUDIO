import { describe, expect, it } from 'vitest';
import { SimulationClock } from '@volstudio/core/time';
import { GAME } from '@/config/game';
import { TANK, WEAPON } from '@/config/tank';
import { angleDelta } from '@volstudio/core/math';
import type { SimEvent } from '@/sim/events';
import { command, DT, simulation, STEP_MS, tank, world } from '../support/sim';

/**
 * HİSSİYAT ZARFI. Sürüş hissinin ölçülebilir karşılıkları burada kilitlidir:
 * bir ayar değişikliği (güç, sürtünme, sürücü kazancı) hissi zarfın dışına
 * iterse bu kapı düşer. Zarflar bilinçli olarak dar değil: amaç ayarı
 * dondurmak değil, hissin sessizce kaymasını yakalamaktır. Zarfı değiştirmek
 * bir tasarım kararıdır ve DESIGN.md'deki tabloyla birlikte yapılır.
 */
function timeUntil(condition: () => boolean, step: () => void, limit = 10): number {
  let elapsed = 0;
  while (!condition() && elapsed < limit) {
    step();
    elapsed += DT;
  }
  return elapsed;
}

describe('hissiyat zarfı', () => {
  it('taret 90° nişana 0.45–0.6 s içinde oturur; sürekli ateş saniyede iki atışı geçmez', () => {
    const subject = tank();
    const space = world();
    const seconds = timeUntil(
      () => Math.abs(angleDelta(subject.turret, Math.PI / 2)) < 0.01,
      () => subject.step(command({ aimY: 1 }), space, DT),
    );
    expect(seconds).toBeGreaterThan(0.45);
    expect(seconds).toBeLessThan(0.6);
    const sim = simulation();
    const events: SimEvent[] = [];
    for (let step = 0; step < 60; step++) {
      sim.step(command({ fire: true }), STEP_MS);
      sim.drainEvents(events);
    }
    expect(events.filter((event) => event.kind === 'fired')).toHaveLength(2);
    expect(WEAPON.intervalMs).toBeGreaterThanOrEqual(600);
  });

  it('hizalı kalkış: %90 azami hıza 0.8–1.8 s', () => {
    const space = world();
    const subject = tank();
    const seconds = timeUntil(
      () => subject.speed >= TANK.maxSpeed * 0.9,
      () => subject.step(command({ moveX: 1 }), space, DT),
    );
    expect(seconds).toBeGreaterThan(0.8);
    expect(seconds).toBeLessThan(1.8);
  });

  it('azami hızdan fren mesafesi 40–140 birim (1.2–4.4 m)', () => {
    const space = world();
    const subject = tank();
    timeUntil(
      () => subject.speed >= TANK.maxSpeed * 0.99,
      () => subject.step(command({ moveX: 1 }), space, DT),
    );
    const start = subject.x;
    timeUntil(
      () => subject.speed < 1,
      () => subject.step(command(), space, DT),
    );
    const distance = subject.x - start;
    expect(distance).toBeGreaterThan(40);
    expect(distance).toBeLessThan(140);
  });

  it('fren: azami hızdan 55–110 birimde düz kayarak durur, gaz bırakmaktan kısa', () => {
    const stop = (brake: boolean): { distance: number; drift: number } => {
      const space = world(20000);
      const subject = tank({ x: 2000, y: 10000 });
      timeUntil(
        () => subject.speed >= TANK.maxSpeed * 0.99,
        () => subject.step(command({ moveX: 1 }), space, DT),
      );
      const start = { x: subject.x, y: subject.y };
      timeUntil(
        () => subject.speed < 1,
        () => subject.step(command({ brake }), space, DT),
      );
      return { distance: subject.x - start.x, drift: Math.abs(subject.y - start.y) };
    };
    const braked = stop(true);
    const coasted = stop(false);
    expect(braked.distance).toBeGreaterThan(55);
    expect(braked.distance).toBeLessThan(110);
    expect(braked.drift).toBeLessThan(1);
    expect(braked.distance).toBeLessThan(coasted.distance * 0.8);
  });

  it('keskin dönüşte kayar (drift) ama savrulmaz ve hedefe oturur', () => {
    const space = world(40000);
    const subject = tank({ x: 2000, y: 20000 });
    for (let step = 0; step < 180; step++) subject.step(command({ moveX: 1 }), space, DT);
    let slipAngle = 0;
    let spin = 0;
    for (let step = 0; step < 150; step++) {
      subject.step(command({ moveY: 1 }), space, DT);
      if (subject.speed > 30) {
        slipAngle = Math.max(
          slipAngle,
          Math.abs(Math.atan2(subject.lateralSpeed, subject.forwardSpeed)),
        );
      }
      spin = Math.max(spin, Math.abs(subject.angularVelocity));
    }
    const degrees = (radians: number): number => (radians * 180) / Math.PI;
    expect(degrees(slipAngle)).toBeGreaterThan(15);
    expect(degrees(slipAngle)).toBeLessThan(50);
    expect(spin).toBeLessThan(TANK.maxTurnRate * 1.2);
    expect(Math.abs(angleDelta(subject.hull, Math.PI / 2))).toBeLessThan((5 * Math.PI) / 180);
  });

  it('dönüşte fren: kilitli paletler yanal tutuşu bırakır, gövde dönmeyi sürdürür', () => {
    const space = world(40000);
    const subject = tank({ x: 2000, y: 20000 });
    for (let step = 0; step < 180; step++) subject.step(command({ moveX: 1 }), space, DT);
    for (let step = 0; step < 15; step++) subject.step(command({ moveY: 1 }), space, DT);
    const hull = subject.hull;
    let lateral = 0;
    const seconds = timeUntil(
      () => subject.speed < 1,
      () => {
        subject.step(command({ moveY: 1, brake: true }), space, DT);
        lateral = Math.max(lateral, Math.abs(subject.lateralSpeed));
      },
    );
    expect(lateral).toBeGreaterThan(25);
    expect(subject.hull - hull).toBeGreaterThan((5 * Math.PI) / 180);
    expect(subject.hull - hull).toBeLessThan((45 * Math.PI) / 180);
    expect(seconds).toBeLessThan(1.5);
  });

  it('dururken 90° dönüş 0.5–1.2 s, aşma 5° altında', () => {
    const space = world();
    const subject = tank();
    let overshoot = 0;
    const seconds = timeUntil(
      () => Math.abs(angleDelta(subject.hull, Math.PI / 2)) < (5 * Math.PI) / 180,
      () => {
        subject.step(command({ moveY: 1 }), space, DT);
        overshoot = Math.max(overshoot, subject.hull - Math.PI / 2);
      },
    );
    for (let step = 0; step < 60; step++) {
      subject.step(command({ moveY: 1 }), space, DT);
      overshoot = Math.max(overshoot, subject.hull - Math.PI / 2);
    }
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(1.2);
    expect(overshoot).toBeLessThan((5 * Math.PI) / 180);
  });

  it('hızlıyken dönüş dururkenkinden geniştir', () => {
    const turnRate = (startSpeed: number): number => {
      const space = world(20000);
      const subject = tank({ x: 10000, y: 10000 });
      subject.vx = startSpeed;
      subject.trackLeft = startSpeed;
      subject.trackRight = startSpeed;
      // Hedef 45° yanda: sürücü gazı kesmez, hız yüksekken ölçülür.
      let peak = 0;
      for (let step = 0; step < 12; step++) {
        subject.step(command({ moveX: 1, moveY: 1 }), space, DT);
        peak = Math.max(peak, Math.abs(subject.angularVelocity));
      }
      return peak;
    };
    expect(turnRate(TANK.maxSpeed)).toBeLessThan(turnRate(0));
  });

  it('seyirden hızlanma depo tükenmeden yeni tavana yaklaşır', () => {
    const space = world(40000);
    const subject = tank({ x: 1000, y: 20000 });
    for (let step = 0; step < 150; step++) subject.step(command({ moveX: 1 }), space, DT);
    let peak = 0;
    const boostSeconds = TANK.boostCapacity / TANK.boostDrain;
    for (let step = 0; step < Math.round(boostSeconds / DT); step++) {
      subject.step(command({ moveX: 1, boost: true }), space, DT);
      peak = Math.max(peak, subject.speed);
    }
    expect(peak).toBeGreaterThan(TANK.maxSpeed * TANK.boostMultiplier * 0.9);
  });

  it('durarak ateş: tank hissedilir ama kaymadan geri teper, gövde yaylanır', () => {
    const sim = simulation();
    const start = { x: sim.player.tank.x, y: sim.player.tank.y };
    sim.step(command({ fire: true }), STEP_MS);
    let peak = 0;
    for (let step = 0; step < 30; step++) {
      sim.step(command(), STEP_MS);
      peak = Math.max(peak, Math.abs(sim.player.tank.suspension.pitch));
    }
    const moved = Math.hypot(sim.player.tank.x - start.x, sim.player.tank.y - start.y);
    expect(moved).toBeGreaterThan(0.5);
    expect(moved).toBeLessThan(12);
    expect(peak).toBeGreaterThan(0.8);
    expect(sim.player.tank.speed).toBeLessThan(1);
  });

  it('duvardan sekme enerjiyi sönümler', () => {
    const space = world(1024);
    const subject = tank({ x: 960, y: 512 });
    subject.vx = 300;
    subject.trackLeft = 300;
    subject.trackRight = 300;
    let rebound = 0;
    let impact = 0;
    for (let step = 0; step < 30; step++) {
      subject.step(command(), space, DT);
      impact = Math.max(impact, subject.contact.speed);
      rebound = Math.min(rebound, subject.vx);
    }
    expect(impact).toBeGreaterThan(150);
    expect(-rebound).toBeGreaterThan(0);
    expect(-rebound).toBeLessThan(impact * TANK.wallRestitution * 1.2);
  });
});

describe('kare hızı bağımsızlığı', () => {
  it('30, 60, 90 ve 144 Hz çizim aynı adımda bit düzeyinde aynı durumu verir', () => {
    const TARGET_STEPS = 240;
    /** Komut simülasyon adımından türer; çizim hızından değil. */
    const commandAt = (step: number) => {
      const angle = step * 0.05;
      return command({
        moveX: Math.cos(angle),
        moveY: Math.sin(angle),
        aimX: Math.cos(angle * 2),
        aimY: Math.sin(angle * 2),
        fire: step % 7 === 0,
        boost: step % 90 > 30,
      });
    };
    const run = (frameMs: number): number[] => {
      const sim = simulation();
      const clock = new SimulationClock({
        fixedStepMs: GAME.simulationStepMs,
        maxStepsPerFrame: GAME.maxStepsPerFrame,
        partialStep: 'defer',
      });
      let steps = 0;
      while (steps < TARGET_STEPS) {
        clock.advance(frameMs, (stepMs) => {
          if (steps >= TARGET_STEPS) return;
          sim.step(commandAt(steps), stepMs);
          steps++;
        });
        const alpha = clock.getInterpolationAlpha();
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(1);
      }
      const tank = sim.player.tank;
      return [tank.x, tank.y, tank.hull, tank.turret, tank.suspension.pitch, sim.projectiles.count];
    };
    const reference = run(1000 / 60);
    for (const frameMs of [1000 / 30, 1000 / 90, 1000 / 144]) {
      expect(run(frameMs)).toEqual(reference);
    }
  });
});
