import { describe, expect, it } from 'vitest';
import { CHAOS } from '@/config/chaos';
import { STRIKER, WIDOW, type VehicleSpec } from '@/config/vehicles';
import { Simulation } from '@/sim/Simulation';
import type { SimEvent } from '@/sim/events';
import { command, STEP_MS, world } from '../support/sim';

function sim(spec: VehicleSpec = STRIKER): Simulation {
  return new Simulation({ world: world(8192), vehicle: spec });
}

function run(
  subject: Simulation,
  patch: Parameters<typeof command>[0],
  seconds: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const full = command(patch);
  for (let step = 0; step < Math.round((seconds * 1000) / STEP_MS); step++) {
    subject.step(full, STEP_MS);
    subject.drainEvents(events);
  }
  return events;
}

describe('Kaos çarpanı', () => {
  it('varsayılanı 1; aralık dışı değeri reddeder', () => {
    const subject = sim();
    expect(subject.pace).toBe(CHAOS.default);
    expect(() => (subject.pace = CHAOS.max + 0.1)).toThrow(RangeError);
    expect(() => (subject.pace = CHAOS.min - 0.1)).toThrow(RangeError);
    expect(() => (subject.pace = Number.NaN)).toThrow(RangeError);
    subject.pace = 2;
    expect(subject.pace).toBe(2);
  });

  it('hareket çarpanla orantılı hızlanır: aynı sürede iki katı yol', () => {
    const slow = sim();
    const fast = sim();
    fast.pace = 2;
    slow.player.chassis.place(1000, 4096, 0);
    fast.player.chassis.place(1000, 4096, 0);
    run(slow, { moveX: 1 }, 3);
    run(fast, { moveX: 1 }, 3);
    const slowDistance = slow.player.chassis.x - 1000;
    const fastDistance = fast.player.chassis.x - 1000;
    expect(fastDistance / slowDistance).toBeGreaterThan(1.8);
    expect(fastDistance / slowDistance).toBeLessThan(2.3);
  });

  it("1'in altında yavaşlatır", () => {
    const base = sim();
    const slow = sim();
    slow.pace = 0.5;
    base.player.chassis.place(1000, 4096, 0);
    slow.player.chassis.place(1000, 4096, 0);
    run(base, { moveX: 1 }, 3);
    run(slow, { moveX: 1 }, 3);
    expect(slow.player.chassis.x - 1000).toBeLessThan((base.player.chassis.x - 1000) * 0.65);
  });

  it('atış sıklığı çarpanla orantılı artar; mermi hasarı değişmez', () => {
    const shots = (pace: number): number => {
      const subject = sim(WIDOW);
      subject.pace = pace;
      const events = run(subject, { fire: true }, 4);
      return events.filter((event) => event.kind === 'fired').length;
    };
    const normal = shots(1);
    const chaotic = shots(2);
    expect(chaotic / normal).toBeGreaterThan(1.8);
    expect(chaotic / normal).toBeLessThan(2.2);
  });

  it('yüksek tempoda duvar çarpması yine olay üretir ve en sert temas korunur', () => {
    const subject = sim();
    subject.pace = CHAOS.max;
    subject.player.chassis.place(400, 4096, Math.PI);
    const events = run(subject, { moveX: -1 }, 4);
    expect(events.some((event) => event.kind === 'wallHit')).toBe(true);
    expect(subject.player.chassis.x).toBeGreaterThan(0);
  });

  it('tempo ne olursa olsun aynı girdi aynı sonucu verir (belirlenimci)', () => {
    const a = sim();
    const b = sim();
    a.pace = b.pace = 1.75;
    run(a, { moveX: 0.6, moveY: -0.3, fire: true }, 2);
    run(b, { moveX: 0.6, moveY: -0.3, fire: true }, 2);
    expect(a.player.chassis.x).toBe(b.player.chassis.x);
    expect(a.player.chassis.y).toBe(b.player.chassis.y);
  });
});
