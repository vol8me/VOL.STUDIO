import { describe, expect, it } from 'vitest';
import { SUSPENSION } from '@/config/tank';
import { Suspension } from '@/sim/tank/Suspension';
import { DT } from '../../support/sim';

function settle(suspension: Suspension, forward: number, right: number, seconds: number): void {
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    suspension.step(forward, right, 0, 0, DT);
  }
}

describe('Suspension', () => {
  it('ivmenin tersine yaylanır ve sabit ivmede oturur', () => {
    const suspension = new Suspension(SUSPENSION);
    settle(suspension, 300, 0, 3);
    const expected = -300 * SUSPENSION.pitchPerAccel;
    expect(suspension.pitch).toBeCloseTo(expected, 2);
    settle(suspension, 0, -200, 3);
    expect(suspension.pitch).toBeCloseTo(0, 2);
    expect(suspension.roll).toBeCloseTo(200 * SUSPENSION.rollPerAccel, 2);
  });

  it('darbe salınımla söner, sınırı aşmaz', () => {
    const suspension = new Suspension(SUSPENSION);
    suspension.kick(-400, 0);
    let peak = 0;
    let crossings = 0;
    let last = 0;
    for (let step = 0; step < 240; step++) {
      suspension.step(0, 0, 0, 0, DT);
      peak = Math.max(peak, Math.abs(suspension.pitch));
      if (last < 0 && suspension.pitch > 0) crossings++;
      last = suspension.pitch;
    }
    expect(peak).toBeLessThanOrEqual(SUSPENSION.maxOffset);
    expect(crossings).toBeGreaterThanOrEqual(1);
    expect(Math.abs(suspension.pitch)).toBeLessThan(0.05);
  });

  it('yol titreşimi hızla artar ve deterministiktir', () => {
    const run = (speed: number): number[] => {
      const suspension = new Suspension(SUSPENSION);
      const trace: number[] = [];
      for (let step = 0; step < 120; step++) {
        suspension.step(0, 0, speed, step * 4, DT);
        trace.push(suspension.pitch);
      }
      return trace;
    };
    const energy = (trace: number[]): number =>
      trace.reduce((sum, value) => sum + value * value, 0);
    expect(energy(run(0))).toBe(0);
    expect(energy(run(230))).toBeGreaterThan(0);
    expect(run(230)).toEqual(run(230));
  });
});
