import { describe, expect, it } from 'vitest';
import { TANK } from '@/config/tank';
import { angleDelta } from '@volstudio/core/math';
import { command, drive, DT, tank, world } from '../../support/sim';

describe('Tank fiziği', () => {
  it('kalkış çekiş sürtünmesiyle sınırlıdır ve azami hıza oturur', () => {
    const space = world();
    const subject = tank();
    let peakAccel = 0;
    let previous = 0;
    for (let step = 0; step < 150; step++) {
      subject.step(command({ moveX: 1 }), space, DT);
      peakAccel = Math.max(peakAccel, (subject.speed - previous) / DT);
      previous = subject.speed;
    }
    expect(peakAccel).toBeLessThanOrEqual(TANK.tractionFriction * TANK.gravity * 1.02);
    expect(subject.speed).toBeCloseTo(TANK.maxSpeed, -1);
    expect(subject.speed).toBeLessThanOrEqual(TANK.maxSpeed + 1);
  });

  it('girdi bırakılınca paletler frenler ve tank durur', () => {
    const space = world();
    const subject = tank();
    drive(subject, space, { moveX: 1 }, 2);
    const coastTime = TANK.maxSpeed / TANK.engineBraking;
    drive(subject, space, {}, coastTime * 1.5);
    expect(subject.speed).toBeLessThan(1);
  });

  it('fren paletleri kilitler; direksiyon devre dışı, tank düz kayarak durur', () => {
    const space = world();
    const subject = tank();
    drive(subject, space, { moveX: 1 }, 2);
    const hull = subject.hull;
    drive(subject, space, { moveY: 1, brake: true }, 0.1);
    expect(subject.braking).toBe(true);
    expect(subject.trackLeft).toBe(0);
    expect(subject.trackRight).toBe(0);
    expect(subject.slip).toBeGreaterThan(TANK.slidingSpeed);
    drive(subject, space, { moveY: 1, brake: true }, 1.5);
    expect(subject.speed).toBeLessThan(1);
    expect(Math.abs(subject.hull - hull)).toBeLessThan(0.05);
    drive(subject, space, { moveX: 1 }, 0.1);
    expect(subject.braking).toBe(false);
  });

  it('aktarma paleti zeminden sürüş kaymasından fazla ayrılmaz (tork sınırlı)', () => {
    const space = world();
    const subject = tank();
    for (let step = 0; step < 60; step++) {
      subject.step(command({ moveX: 1, moveY: step % 20 < 10 ? 0.5 : -0.5 }), space, DT);
      expect(subject.slip).toBeLessThanOrEqual(
        TANK.driveSlip + 1e-9 + Math.abs(subject.lateralSpeed),
      );
    }
  });

  it('yerinde dönüşte paletler ters yöne akar ve gövde hedefe aşmadan oturur', () => {
    const space = world();
    const subject = tank();
    let overshoot = 0;
    for (let step = 0; step < 120; step++) {
      subject.step(command({ moveY: 1 }), space, DT);
      overshoot = Math.max(overshoot, subject.hull - Math.PI / 2);
      if (step === 10) {
        expect(subject.trackLeft).toBeGreaterThan(0);
        expect(subject.trackRight).toBeLessThan(0);
        expect(Math.hypot(subject.x - 2048, subject.y - 2048)).toBeLessThan(6);
      }
    }
    expect(Math.abs(angleDelta(subject.hull, Math.PI / 2))).toBeLessThan(0.02);
    expect(overshoot).toBeLessThan(0.09);
  });

  it('arkadaki hedefte geri geri gider', () => {
    const space = world();
    const subject = tank();
    drive(subject, space, { moveX: -1 }, 1.5);
    expect(subject.reversing).toBe(true);
    expect(subject.forwardSpeed).toBeCloseTo(-TANK.reverseSpeed, -1);
    expect(subject.x).toBeLessThan(2048);
  });

  it('hızlanma tavanı yükseltir, depo tükenir ve eşikten sonra döner', () => {
    const space = world(20000);
    const subject = tank({ x: 1000, y: 10000 });
    drive(subject, space, { moveX: 1, boost: true }, 2);
    expect(subject.boosting).toBe(true);
    expect(subject.speed).toBeGreaterThan(TANK.maxSpeed * 1.3);
    const boosted = command({ moveX: 1, boost: true });
    for (let step = 0; step < 600 && subject.boosting; step++) subject.step(boosted, space, DT);
    expect(subject.boosting).toBe(false);
    let waited = 0;
    while (!subject.boosting && waited < 5) {
      subject.step(boosted, space, DT);
      waited += DT;
    }
    expect(waited).toBeCloseTo(TANK.boostRestart / TANK.boostRegen, 1);
    drive(subject, space, { moveX: 1 }, TANK.boostCapacity / TANK.boostRegen + 0.2);
    expect(subject.boost).toBe(TANK.boostCapacity);
  });

  it('duvara çarpınca durur, seker ve içeride kalır', () => {
    const space = world(1024);
    const subject = tank({ x: 700, y: 512 });
    let impact = 0;
    let bounced = false;
    for (let step = 0; step < 180; step++) {
      subject.step(command({ moveX: 1, boost: true }), space, DT);
      impact = Math.max(impact, subject.contact.speed);
      if (subject.contact.speed > 0 && subject.vx < 0) bounced = true;
    }
    expect(impact).toBeGreaterThan(100);
    expect(bounced).toBe(true);
    expect(subject.x + TANK.halfLength).toBeLessThanOrEqual(1024 + 1e-6);
    expect(subject.contact.normalX).toBe(-1);
  });

  it('açılı çarpma tankı döndürür', () => {
    const space = world(1024);
    const subject = tank({ x: 988, y: 512, hull: 0.5 });
    subject.vx = 250;
    subject.step(command(), space, DT);
    subject.step(command(), space, DT);
    expect(Math.abs(subject.angularVelocity)).toBeGreaterThan(0.1);
  });

  it('itki kütle merkezinde yalnız öteler, dışında döndürür', () => {
    const subject = tank();
    subject.applyImpulse(-TANK.mass * 50, 0);
    expect(subject.vx).toBeCloseTo(-50);
    expect(subject.angularVelocity).toBe(0);
    subject.applyImpulse(0, TANK.mass * 10, subject.x + 20, subject.y);
    expect(subject.angularVelocity).toBeGreaterThan(0);
  });

  it('kalkışta gövde geriye yaylanır', () => {
    const space = world();
    const subject = tank();
    drive(subject, space, { moveX: 1 }, 0.35);
    expect(subject.suspension.pitch).toBeLessThan(-0.5);
  });

  it('taret nişana sınırlı hızla döner, bırakılınca bekleyip gövdeye döner', () => {
    const space = world();
    const subject = tank();
    subject.step(command({ aimY: 1 }), space, DT);
    expect(subject.turret).toBeCloseTo(TANK.turretTurnRate * DT);
    drive(subject, space, { aimY: 1 }, 1);
    expect(subject.turret).toBeCloseTo(Math.PI / 2);
    drive(subject, space, {}, TANK.turretRestDelay * 0.5);
    expect(subject.turret).toBeCloseTo(Math.PI / 2);
    drive(subject, space, {}, TANK.turretRestDelay);
    expect(subject.turret).toBeCloseTo(subject.hull);
  });

  it('poz kaydı adımdan önceki durumu ve süspansiyonu tutar', () => {
    const space = world();
    const subject = tank();
    drive(subject, space, { moveX: 1 }, 0.3);
    subject.capturePose();
    const before = { ...subject.previous };
    subject.step(command({ moveX: 1 }), space, DT);
    expect(subject.previous).toEqual(before);
    expect(subject.x).toBeGreaterThan(before.x);
  });
});
