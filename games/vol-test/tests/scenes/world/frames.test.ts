import { describe, expect, it } from 'vitest';
import { TANK } from '@/config/tank';
import { hudFrame, tankFrame } from '@/scenes/world/frames';
import { command, DT, tank, world } from '../../support/sim';

describe('frames', () => {
  it('poz, taret ve süspansiyon önceki ve güncel adım arasında ara değerlenir', () => {
    const subject = tank();
    const space = world();
    for (let step = 0; step < 20; step++) {
      subject.capturePose();
      subject.step(command({ moveX: 1, aimY: 1 }), space, DT);
    }
    const start = tankFrame(subject, 0);
    const end = tankFrame(subject, 1);
    const half = tankFrame(subject, 0.5);
    expect(start.x).toBe(subject.previous.x);
    expect(end.x).toBe(subject.x);
    expect(half.x).toBeCloseTo((start.x + end.x) / 2);
    expect(half.pitch).toBeCloseTo((start.pitch + end.pitch) / 2);
    expect(end.turret).toBeCloseTo(subject.turret);
  });

  it('HUD karesi sürüş durumunu ve görünen alanı taşır', () => {
    const subject = tank();
    const frame = hudFrame(subject, tankFrame(subject, 1), TANK.boostCapacity, {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(frame).toMatchObject({
      boost: TANK.boostCapacity,
      reversing: false,
      view: { width: 3 },
    });
  });
});
