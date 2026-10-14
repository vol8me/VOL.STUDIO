import { describe, expect, it } from 'vitest';
import { angleDelta } from '@volstudio/core/math';
import { HOVER } from '@/config/hover';
import { MANTA } from '@/config/vehicles';
import { createChassisState } from '@/sim/chassis/ChassisState';
import { TRACK_LEFT, TRACK_RIGHT } from '@/sim/chassis/parts';
import { Hover } from '@/sim/hover/Hover';
import { command, DT, world } from '../../support/sim';

const space = world(8192);

function hover(at = { x: 4096, y: 4096, hull: 0 }): Hover {
  const result = new Hover(MANTA.hover, MANTA.suspension);
  result.place(at.x, at.y, at.hull);
  return result;
}

function run(subject: Hover, patch: Parameters<typeof command>[0], seconds: number): void {
  const full = command(patch);
  for (let step = 0; step < Math.round(seconds / DT); step++) subject.step(full, space, DT);
}

describe('Hover sürüşü', () => {
  it('her yönde aynı tavan hıza çıkar: yana ve geriye süzülmek ileri kadar hızlıdır', () => {
    for (const [moveX, moveY] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ]) {
      const subject = hover();
      run(subject, { moveX, moveY, aimX: 1 }, 3);
      expect(subject.speed, `${moveX},${moveY}`).toBeGreaterThan(HOVER.maxSpeed * 0.98);
      expect(subject.speed).toBeLessThan(HOVER.maxSpeed * 1.02);
      expect(Math.atan2(subject.vy, subject.vx)).toBeCloseTo(Math.atan2(moveY, moveX), 2);
    }
  });

  it('gövde yürüdüğü yöne değil NİŞANA bakar; nişan yoksa harekete, hareket de yoksa olduğu gibi kalır', () => {
    const strafing = hover();
    run(strafing, { moveY: -1, aimY: 1 }, 2);
    expect(angleDelta(strafing.hull, Math.PI / 2)).toBeCloseTo(0, 1);
    expect(strafing.vy).toBeLessThan(-HOVER.maxSpeed * 0.9);

    const unaimed = hover();
    run(unaimed, { moveY: 1 }, 2);
    expect(angleDelta(unaimed.hull, Math.PI / 2)).toBeCloseTo(0, 1);

    const idle = hover({ x: 4096, y: 4096, hull: 1 });
    run(idle, {}, 1);
    expect(idle.hull).toBeCloseTo(1, 6);
  });

  it('süzülür: komut bırakılınca hız tırmanıştan yavaş söner ve araç epey yol alır', () => {
    const subject = hover();
    run(subject, { moveX: 1, aimX: 1 }, 2);
    const top = subject.speed;
    run(subject, { aimX: 1 }, 0.4);
    expect(subject.speed).toBeGreaterThan(top * 0.3);
    const before = subject.x;
    run(subject, { aimX: 1 }, 3);
    expect(subject.speed).toBeLessThan(1);
    expect(subject.x - before).toBeGreaterThan(20);
    // Tırmanış frenlemeden hızlıdır: tavan hıza yarım saniyede çıkar.
    const climber = hover();
    run(climber, { moveX: 1, aimX: 1 }, 0.5);
    expect(climber.speed).toBeGreaterThan(HOVER.maxSpeed * 0.8);
  });

  it('Space basılı tutulduğu sürece iticilere yüklenir: tavanı aşar, bırakınca söner, depo boşalınca biter', () => {
    const subject = hover();
    run(subject, { moveX: 1, aimX: 1, brake: true }, 0.3);
    expect(subject.boosting).toBe(true);
    expect(subject.speed).toBeGreaterThan(HOVER.maxSpeed * 1.2);
    run(subject, { moveX: 1, aimX: 1 }, 0.1);
    expect(subject.boosting).toBe(false);

    const drained = hover();
    run(drained, { moveX: 1, aimX: 1, brake: true }, 2);
    expect(drained.boosting).toBe(false);
    expect(drained.boost).toBeLessThan(drained.boostCapacity);
    run(drained, { aimX: 1 }, 6);
    expect(drained.boost).toBeGreaterThan(drained.boostCapacity * 0.9);
  });

  it('hareket yokken de atılım gövdenin baktığı yöne fırlatır', () => {
    const subject = hover({ x: 4096, y: 4096, hull: Math.PI / 2 });
    run(subject, { aimY: 1, brake: true }, 0.3);
    expect(subject.vy).toBeGreaterThan(HOVER.maxSpeed);
    expect(Math.abs(subject.vx)).toBeLessThan(HOVER.maxSpeed * 0.3);
  });

  it('yan yüzey sinyalleri: yüzey hızı gövdeyle akar, kayma ve patinaj hiç yoktur', () => {
    const subject = hover();
    run(subject, { moveX: 1, aimX: 1 }, 1.5);
    expect(subject.trackLeft).toBeCloseTo(subject.trackRight, 0);
    expect(subject.trackLeft).toBeGreaterThan(HOVER.maxSpeed * 0.9);
    expect(subject.treadLeft).toBeGreaterThan(100);
    expect(subject.groundLeft).toBeGreaterThan(100);
    expect(subject.slip).toBe(0);
    expect(subject.slideLeft).toBe(0);
    expect(subject.slideRight).toBe(0);
    expect(subject.reversing).toBe(false);
    expect(subject.braking).toBe(false);
  });

  it('kırık itici kapasiteyi keser ve gövdeyi kırık yana savurur; iki itici kırılınca taban kalır', () => {
    const healthy = hover();
    run(healthy, { moveX: 1, aimX: 1 }, 3);

    const lame = hover();
    lame.parts = TRACK_LEFT;
    run(lame, { moveX: 1, aimX: 1 }, 3);
    expect(lame.speed).toBeLessThan(healthy.speed * 0.8);
    // Sol itici kırık: gövde sola (−y yönüne, negatif açıya) savrulur ve nişana kendini tam çeviremez.
    expect(lame.hull).toBeLessThan(-0.05);

    const mirror = hover();
    mirror.parts = TRACK_RIGHT;
    run(mirror, { moveX: 1, aimX: 1 }, 3);
    expect(mirror.hull).toBeGreaterThan(0.05);
    expect(mirror.hull).toBeCloseTo(-lame.hull, 4);

    const wrecked = hover();
    wrecked.parts = TRACK_LEFT | TRACK_RIGHT;
    run(wrecked, { moveX: 1, aimX: 1 }, 4);
    expect(wrecked.speed).toBeGreaterThan(HOVER.maxSpeed * 0.3);
    expect(wrecked.speed).toBeLessThan(lame.speed);
  });

  it('aynı komut dizisi aynı durumu verir ve durum yazılıp geri yüklenince sürüş bozulmaz', () => {
    const script = (subject: Hover): void => {
      run(subject, { moveX: 1, moveY: 0.4, aimY: 1, brake: true }, 0.5);
      run(subject, { moveY: -1, aimX: -1 }, 0.7);
    };
    const first = hover();
    const second = hover();
    script(first);
    script(second);
    expect(first.captureState()).toEqual(second.captureState());

    const saved = createChassisState();
    first.captureState(saved);
    const restored = hover({ x: 0, y: 0, hull: 0 });
    restored.restoreState(saved);
    run(first, { moveX: 1, aimX: 1 }, 0.5);
    run(restored, { moveX: 1, aimX: 1 }, 0.5);
    expect(restored.captureState()).toEqual(first.captureState());
  });
});
