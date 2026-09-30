import { describe, expect, it } from 'vitest';
import { TANK } from '@/config/tank';
import { RigidBody } from '@volstudio/core/physics';
import { computeTrackForces, createTrackForces } from '@/sim/tank/trackForces';

function body(): RigidBody {
  return new RigidBody(
    TANK.mass,
    RigidBody.boxInertia(TANK.mass, TANK.halfLength * 2, TANK.halfWidth * 2),
  );
}

const load = (TANK.mass * TANK.gravity) / 2;
const grip = TANK.tractionFriction * load;
const kineticGrip = TANK.tractionKinetic * load;

describe('computeTrackForces', () => {
  it('çekiş palet başına Coulomb sürtünmesiyle sınırlıdır', () => {
    const forces = computeTrackForces(body(), 5000, 5000, false, TANK, createTrackForces());
    expect(forces.forward).toBeLessThanOrEqual(2 * grip);
    expect(forces.slip).toBe(5000);
  });

  it('direksiyon ünitesi doygunlukta da itki farkını korur', () => {
    const forces = computeTrackForces(body(), 5000, 4000, false, TANK, createTrackForces());
    expect(forces.torque).toBeGreaterThan(0);
    const straight = computeTrackForces(body(), 5000, 5000, false, TANK, createTrackForces());
    expect(straight.torque).toBeCloseTo(0);
  });

  it('motor gücü yüksek hızda itkiyi sınırlar, hızlanma gücü artırır', () => {
    const fast = body();
    fast.vx = 200;
    const normal = computeTrackForces(fast, 400, 400, false, TANK, createTrackForces());
    const boosted = computeTrackForces(fast, 400, 400, true, TANK, createTrackForces());
    expect(normal.forward * 200).toBeLessThanOrEqual(TANK.enginePower * 1.001);
    expect(boosted.forward).toBeGreaterThan(normal.forward);
  });

  it('kilitli palet kinetik sürtünmeyle frenler; fren güçle sınırlı değildir', () => {
    const fast = body();
    fast.vx = 200;
    const forces = computeTrackForces(fast, 0, 0, false, TANK, createTrackForces());
    expect(forces.forward).toBeLessThan(-kineticGrip * 1.95);
    expect(forces.forward).toBeGreaterThan(-grip * 2);
    expect(-forces.forward * 200).toBeGreaterThan(TANK.enginePower);
    expect(forces.slideLeft).toBeCloseTo(200);
    expect(forces.slip).toBeCloseTo(200);
  });

  it('tutunan palet statik, kayan palet kinetik katsayıyı görür', () => {
    const rolling = body();
    rolling.vx = 100;
    const perSlip = (track: number): number =>
      computeTrackForces(rolling, track, track, false, TANK, createTrackForces()).forward;
    // Küçük kaymada kuvvet doğrusal; büyük kaymada tavan kinetiğe iner.
    expect(perSlip(100 - 5)).toBeLessThan(0);
    expect(-perSlip(-400)).toBeLessThan(2 * grip * 0.8);
  });

  it('kilitli palet yanal tutuşunu yitirir: kuvvet kayma yönüne izdüşer', () => {
    const lateral = (track: number): number => {
      const subject = body();
      subject.vx = 200;
      subject.vy = 20;
      return computeTrackForces(subject, track, track, false, TANK, createTrackForces()).lateral;
    };
    const rolling = lateral(200);
    const locked = lateral(0);
    expect(rolling).toBeLessThan(0);
    expect(locked).toBeLessThan(0);
    expect(Math.abs(locked)).toBeLessThan(Math.abs(rolling) * 0.3);
  });

  it('yanal kaymaya karşı koyar; dönme direnci hızla azalır', () => {
    const sliding = body();
    sliding.vy = 50;
    expect(
      computeTrackForces(sliding, 0, 0, false, TANK, createTrackForces()).lateral,
    ).toBeLessThan(0);

    const spin = (forward: number): number => {
      const subject = body();
      subject.vx = forward;
      subject.angularVelocity = 3;
      return computeTrackForces(
        subject,
        forward + 46.5,
        forward - 46.5,
        false,
        TANK,
        createTrackForces(),
      ).torque;
    };
    expect(spin(200)).toBeGreaterThan(spin(0));
  });
});
