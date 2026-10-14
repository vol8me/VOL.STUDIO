import { describe, expect, it } from 'vitest';
import { angleDelta } from '@volstudio/core/math';
import { ARACHNID_LOOK } from '@/config/spiders';
import { ARACHNID } from '@/config/vehicles';
import { WALKER } from '@/config/walker';
import { createChassisState } from '@/sim/chassis/ChassisState';
import { Walker } from '@/sim/walker/Walker';
import { command, DT, world } from '../../support/sim';

const space = world(8192);
const SPEC = ARACHNID.walker;

function walker(at = { x: 4096, y: 4096, hull: 0 }): Walker {
  const result = new Walker(SPEC, ARACHNID.suspension);
  result.place(at.x, at.y, at.hull);
  return result;
}

function run(
  subject: Walker,
  patch: Parameters<typeof command>[0],
  seconds: number,
  surface?: { grip: number },
): void {
  const full = command(patch);
  for (let step = 0; step < Math.round(seconds / DT); step++)
    subject.step(full, space, DT, surface);
}

describe('Walker sürüşü', () => {
  it('her yönde aynı tavan hıza çıkar (yan ve geri dahil)', () => {
    for (const [moveX, moveY] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [Math.SQRT1_2, Math.SQRT1_2],
    ]) {
      const subject = walker();
      run(subject, { moveX, moveY, aimX: 1 }, 3);
      expect(subject.speed, `${moveX},${moveY}`).toBeGreaterThan(SPEC.maxSpeed * 0.98);
      expect(subject.speed).toBeLessThan(SPEC.maxSpeed * 1.02);
      expect(Math.atan2(subject.vy, subject.vx)).toBeCloseTo(Math.atan2(moveY, moveX), 2);
    }
  });

  it('analog komut hızı orantılar; ölü bölgenin altı yürütmez', () => {
    const half = walker();
    run(half, { moveX: 0.5 }, 3);
    expect(half.speed).toBeCloseTo(SPEC.maxSpeed * 0.5, 0);
    const idle = walker();
    run(idle, { moveX: SPEC.moveDeadzone * 0.9 }, 1);
    expect(idle.speed).toBe(0);
    expect(idle.x).toBe(4096);
  });

  it('gövde hareket yönüne döner, nişan yalnız tareti sürer; hareket yoksa yerinde kalır', () => {
    const aiming = walker();
    run(aiming, { moveX: 1, aimY: 1 }, 2);
    expect(angleDelta(aiming.hull, 0)).toBeCloseTo(0, 1);
    expect(aiming.turret).toBeGreaterThan(1);

    const moving = walker();
    run(moving, { moveY: -1, aimX: 1 }, 2);
    expect(angleDelta(moving.hull, -Math.PI / 2)).toBeCloseTo(0, 1);

    const aimOnly = walker();
    run(aimOnly, { aimY: 1 }, 1);
    expect(aimOnly.hull).toBeCloseTo(0, 6);

    const idle = walker({ x: 4096, y: 4096, hull: 1 });
    run(idle, {}, 1);
    expect(idle.hull).toBeCloseTo(1, 6);
  });

  it('gövde dönüşü sınırlıdır; silah yuvası ondan hızlı döner', () => {
    const subject = walker();
    let peak = 0;
    const full = command({ moveX: -1 });
    for (let step = 0; step < 120; step++) {
      subject.step(full, space, DT);
      peak = Math.max(peak, Math.abs(subject.angularVelocity));
    }
    expect(peak).toBeLessThanOrEqual(SPEC.maxTurnRate * 1.01);
    expect(peak).toBeGreaterThan(SPEC.maxTurnRate * 0.9);
    expect(SPEC.turretTurnRate).toBeGreaterThan(SPEC.maxTurnRate * 1.5);
  });

  it('Shift hızlandırmaz: yürüyücünün atılımı yalnız Space iledir', () => {
    const subject = walker();
    run(subject, { moveX: 1, boost: true }, 1);
    expect(subject.boosting).toBe(false);
    expect(subject.speed).toBeLessThan(SPEC.maxSpeed * 1.02);
  });

  it('Space kilitli atılım başlatır: bırakılsa da depo boşalana dek sürer, hareketsiz de atılır', () => {
    const dash = walker();
    run(dash, { brake: true }, 0.05);
    expect(dash.boosting).toBe(true);
    run(dash, {}, 0.2);
    expect(dash.boosting).toBe(true);
    expect(dash.speed).toBeGreaterThan(SPEC.maxSpeed * 1.4);
    expect(dash.x).toBeGreaterThan(4096);
    expect(dash.y).toBeCloseTo(4096, 0);
    const lunge = SPEC.boostCapacity / SPEC.boostDrain;
    run(dash, {}, lunge);
    expect(dash.boosting).toBe(false);
    expect(dash.boost).toBeLessThan(SPEC.boostRestart);
  });

  it('atılım eşiğe dolana dek yeniden başlamaz ve doluluk sonunda tekrar açılır', () => {
    const dash = walker();
    run(dash, { brake: true }, 0.05);
    run(dash, {}, SPEC.boostCapacity / SPEC.boostDrain + 0.05);
    run(dash, { brake: true }, 0.3);
    expect(dash.boosting).toBe(false);
    run(dash, {}, (SPEC.boostRestart - dash.boost) / SPEC.boostRegen + 0.1);
    run(dash, { brake: true }, 0.05);
    expect(dash.boosting).toBe(true);
  });

  it('gövde hedef yöne dönükse hızlı yürür; ters dönükken tavan kısılır', () => {
    const aligned = walker();
    run(aligned, { moveX: 1 }, 0.25);
    const behind = walker({ x: 4096, y: 4096, hull: Math.PI });
    run(behind, { moveX: 1 }, 0.25);
    expect(behind.speed).toBeLessThan(aligned.speed * 0.8);
  });

  it('komut bırakılınca kısa sürede durur', () => {
    const subject = walker();
    run(subject, { moveX: 1 }, 2);
    const before = subject.x;
    run(subject, {}, SPEC.maxSpeed / SPEC.braking + 0.1);
    expect(subject.speed).toBeLessThan(1);
    expect(subject.x - before).toBeLessThan((SPEC.maxSpeed * SPEC.maxSpeed) / SPEC.braking);
  });

  it('kaygan zemin hızı ve ivmeyi kısar ama palet kadar değil', () => {
    const grippy = walker();
    run(grippy, { moveX: 1 }, 3, { grip: 1 });
    const slick = walker();
    run(slick, { moveX: 1 }, 3, { grip: 0.2 });
    expect(slick.speed).toBeLessThan(grippy.speed * 0.8);
    expect(slick.speed).toBeGreaterThan(grippy.speed * (1 - WALKER.gripSensitivity));
  });

  it('duvara çarpınca durur, temas kaydedilir ve gövde sınırı aşmaz', () => {
    const subject = walker({ x: 200, y: 4096, hull: 0 });
    let hardest = 0;
    const full = command({ moveX: -1, aimX: -1 });
    for (let step = 0; step < 180; step++) {
      subject.step(full, space, DT);
      hardest = Math.max(hardest, subject.contact.speed);
    }
    expect(hardest).toBeGreaterThan(SPEC.impactEventSpeed);
    expect(subject.x).toBeGreaterThanOrEqual(subject.shape.halfLength - 1);
  });

  it('yan yüzey sinyalleri yürüyüşü ve dönüşü yansıtır, kayma ve fren yoktur', () => {
    const straight = walker();
    run(straight, { moveX: 1 }, 2);
    expect(straight.trackLeft).toBeCloseTo(straight.trackRight, 0);
    expect(straight.treadLeft).toBeGreaterThan(100);
    expect(straight.slip).toBe(0);
    expect(straight.slideLeft + straight.slideRight).toBe(0);
    expect(straight.braking).toBe(false);
    expect(straight.reversing).toBe(false);

    const turning = walker();
    run(turning, { moveY: 1 }, 0.3);
    expect(turning.trackLeft).toBeGreaterThan(turning.trackRight);
  });

  it('durum yakala/geri yükle bir sonraki adımı bit bit korur', () => {
    const driven = command({ moveX: 0.8, moveY: -0.4, aimX: 0.2, aimY: 1, brake: true });
    const original = walker();
    for (let step = 0; step < 90; step++) original.step(driven, space, DT);
    const state = original.captureState(createChassisState());

    const restored = new Walker(SPEC, ARACHNID.suspension);
    restored.restoreState(state);
    for (let step = 0; step < 60; step++) {
      original.step(driven, space, DT);
      restored.step(driven, space, DT);
    }
    expect(restored.captureState(createChassisState())).toEqual(
      original.captureState(createChassisState()),
    );
  });

  it('yeniden doğuş sürüş ve depo belleğini sıfırlar', () => {
    const subject = walker();
    run(subject, { moveX: 1, brake: true }, 0.2);
    subject.resetForRespawn(1000, 1000, 0);
    expect(subject.speed).toBe(0);
    expect(subject.boost).toBe(SPEC.boostCapacity);
    expect(subject.boosting).toBe(false);
    expect(subject.treadLeft).toBe(0);
  });
});

describe('Arachnid tanımı', () => {
  it('iki omuz topu sırayla ateşler; simetriktir ve kabuğun orta hattını açık bırakır', () => {
    const { mounts, salvo, pivot } = ARACHNID.armament;
    expect(mounts).toHaveLength(2);
    expect(salvo).toEqual([[0], [1]]);
    const [left, right] = mounts;
    expect(left.y).toBe(-right.y);
    expect(left.x).toBe(right.x);
    expect(left.reach).toBe(right.reach);
    // Toplar omuzlardadır, orta hat (mercek) iki topun arasında görünür kalır; ağız çizimle aynı yerdedir.
    expect(Math.abs(left.y)).toBeGreaterThan(8);
    expect(Math.abs(left.y)).toBeLessThan(SPEC.halfWidth);
    expect(left.reach).toBe(ARACHNID_LOOK.cannon.muzzleX);
    // Nişan başlangıcı gövde ekseninde, iki topun ortasındadır.
    expect(pivot).toEqual({ x: left.x, y: 0 });
  });

  it('çarpışan gövde bacak açıklığı değil gövdedir', () => {
    expect(SPEC.halfWidth).toBeLessThan(SPEC.halfLength);
    expect(SPEC.halfLength).toBeLessThan(26);
  });
});
