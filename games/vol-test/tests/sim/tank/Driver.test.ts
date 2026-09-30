import { describe, expect, it } from 'vitest';
import { TANK } from '@/config/tank';
import { Driver, type TrackTargets } from '@/sim/tank/Driver';
import { command } from '../../support/sim';

const out = (): TrackTargets => ({ left: 0, right: 0, forward: false, braking: false });

describe('Driver', () => {
  it('girdi yokken paletleri durdurur', () => {
    const targets = new Driver(TANK).plan(command(), 0, 0, 0, false, out());
    expect(targets).toEqual({ left: 0, right: 0, forward: false, braking: false });
  });

  it('hizalı ileri komutta iki palet azami hızı ister', () => {
    const targets = new Driver(TANK).plan(command({ moveX: 1 }), 0, 0, 0, false, out());
    expect(targets.left).toBeCloseTo(TANK.maxSpeed);
    expect(targets.right).toBeCloseTo(TANK.maxSpeed);
    expect(targets.forward).toBe(true);
  });

  it('hızlanma yalnız ileri hızın tavanını büyütür', () => {
    const targets = new Driver(TANK).plan(command({ moveX: 1 }), 0, 0, 0, true, out());
    expect(targets.left).toBeCloseTo(TANK.maxSpeed * TANK.boostMultiplier);
  });

  it('dik hedefte yerinde döner: paletler ters yöne, sağa dönüşte sol palet ileri', () => {
    const targets = new Driver(TANK).plan(command({ moveY: 1 }), 0, 0, 0, false, out());
    expect(targets.left).toBeGreaterThan(0);
    expect(targets.right).toBeLessThan(0);
    expect(targets.left + targets.right).toBeCloseTo(0);
  });

  it('dönüş geride kaldıkça palet farkı büyür', () => {
    const lagging = new Driver(TANK).plan(command({ moveY: 1 }), 0, 0, 0, false, out());
    const turning = new Driver(TANK).plan(
      command({ moveY: 1 }),
      0,
      TANK.maxTurnRate,
      0,
      false,
      out(),
    );
    expect(lagging.left - lagging.right).toBeGreaterThan(turning.left - turning.right);
  });

  it('arkadaki hedefte geri vitese geçer, eşikler titremeyi önler', () => {
    const driver = new Driver(TANK);
    const back = driver.plan(command({ moveX: -1 }), 0, 0, 0, false, out());
    expect(driver.reversing).toBe(true);
    expect(back.left).toBeCloseTo(-TANK.reverseSpeed);
    expect(back.forward).toBe(false);
    const halfway = (TANK.reverseEnter + TANK.reverseExit) / 2;
    driver.plan(
      command({ moveX: Math.cos(halfway), moveY: Math.sin(halfway) }),
      0,
      0,
      0,
      false,
      out(),
    );
    expect(driver.reversing).toBe(true);
    const fresh = new Driver(TANK);
    fresh.plan(
      command({ moveX: Math.cos(halfway), moveY: Math.sin(halfway) }),
      0,
      0,
      0,
      false,
      out(),
    );
    expect(fresh.reversing).toBe(false);
    driver.plan(command(), 0, 0, 0, false, out());
    expect(driver.reversing).toBe(false);
  });
});
