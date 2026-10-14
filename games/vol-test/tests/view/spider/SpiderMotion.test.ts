import { describe, expect, it } from 'vitest';
import { SPIDER_LOOKS } from '@/config/spiders';
import { WALKER_IDS } from '@/config/vehicles';
import { SpiderMotion } from '@/view/spider/SpiderMotion';
import type { LocomotionSignals } from '@/view/spider/signals';

const STEP_MS = 1000 / 60;
const signals = (overrides: Partial<LocomotionSignals> = {}): LocomotionSignals => ({
  x: 0,
  y: 0,
  velX: 0,
  velY: 0,
  speed: 0,
  accelX: 0,
  accelY: 0,
  travelHeadingRad: 0,
  facingHeadingRad: 0,
  turnRateRadPerSec: 0,
  dash01: 0,
  impact01: 0,
  ...overrides,
});

function run(motion: SpiderMotion, input: LocomotionSignals, seconds: number) {
  let pose = motion.pose;
  for (let i = 0; i < Math.round(seconds * 60); i++) pose = motion.update(input, STEP_MS);
  return pose;
}

describe.each(WALKER_IDS.map((id) => [id, SPIDER_LOOKS[id]] as const))(
  'SpiderMotion (%s)',
  (_id, look) => {
    const { motion: tuning, body } = look;
    const fast = look.gait.fullTempoSpeed;
    const make = () => new SpiderMotion(look);

    it('durağan örümcek çömelir; yürümeye başlayınca kalça yükselir', () => {
      const idle = run(make(), signals(), 2);
      const walking = run(make(), signals({ speed: tuning.standSpeed }), 2);
      expect(idle.crouch01).toBeGreaterThan(0.95);
      expect(walking.crouch01).toBeLessThan(0.05);
      expect(walking.hipHeight).toBeGreaterThan(idle.hipHeight + tuning.idleHeightDrop * 0.8);
      expect(walking.hipHeight).toBeCloseTo(body.hipHeight, 0);
    });

    it('atılım ve çarpma kalçayı indirir; çarpmanın etkisi sönünce geri döner', () => {
      const base = run(make(), signals({ speed: fast }), 2).hipHeight;
      const dashing = run(make(), signals({ speed: fast, dash01: 1 }), 2).hipHeight;
      expect(dashing).toBeLessThan(base - tuning.dashHeightDrop * 0.8);
      const motion = make();
      const hit = run(motion, signals({ speed: fast, impact01: 1 }), 1).hipHeight;
      expect(hit).toBeLessThan(base - tuning.impactHeightDrop * 0.8);
      expect(run(motion, signals({ speed: fast }), 2).hipHeight).toBeCloseTo(base, 0);
    });

    it('ayak basışı gövdeyi kısa bir süre çökertir ve yay geri oturtur', () => {
      const motion = make();
      const steady = run(motion, signals({ speed: fast }), 2).hipHeight;
      motion.plant(1);
      let lowest = steady;
      for (let i = 0; i < 20; i++)
        lowest = Math.min(lowest, motion.update(signals({ speed: fast }), STEP_MS).hipHeight);
      expect(lowest).toBeLessThan(steady - tuning.stepBobPx * 0.5);
      expect(run(motion, signals({ speed: fast }), 2).hipHeight).toBeCloseTo(steady, 1);
    });

    it('karın dönüşü geriden izler: sağa dönen gövdede karın sola savrulur', () => {
      const right = run(make(), signals({ speed: fast, turnRateRadPerSec: 2.5 }), 1);
      const left = run(make(), signals({ speed: fast, turnRateRadPerSec: -2.5 }), 1);
      expect(right.abdomenYaw).toBeLessThan(-0.03);
      expect(left.abdomenYaw).toBeGreaterThan(0.03);
      expect(Math.abs(right.abdomenYaw)).toBeLessThanOrEqual(tuning.abdomenMaxYawRad);
    });

    it('gövde ivmenin tersine yaslanır ve yaslanma sınırlıdır', () => {
      const forward = run(make(), signals({ speed: fast, accelX: tuning.accelForMaxLean * 4 }), 1);
      expect(forward.leanX).toBeLessThan(0);
      // Yay hedefi aşabilir (hedef sınırdır); aşım küçük kalmalı.
      expect(Math.abs(forward.leanX)).toBeLessThanOrEqual(tuning.maxLeanPx * 1.25);
      // Gövde 90° dönükken dünya +y ivmesi gövde ekseninde ileridir.
      const turned = run(
        make(),
        signals({ speed: fast, facingHeadingRad: Math.PI / 2, accelY: tuning.accelForMaxLean }),
        1,
      );
      expect(turned.leanX).toBeLessThan(0);
      expect(Math.abs(turned.leanY)).toBeLessThan(Math.abs(turned.leanX));
    });

    it('ileri ivme karnı sıkıştırır, frenleme uzatır', () => {
      const accel = run(make(), signals({ speed: fast, accelX: tuning.accelForMaxLean }), 1);
      const brake = run(make(), signals({ speed: fast, accelX: -tuning.accelForMaxLean }), 1);
      expect(accel.abdomenScale).toBeLessThan(1);
      expect(brake.abdomenScale).toBeGreaterThan(1);
    });

    it('bozuk sinyal yayları kalıcı NaN’a düşürmez', () => {
      const motion = make();
      run(motion, signals({ speed: fast }), 0.5);
      motion.update(
        signals({ turnRateRadPerSec: Number.NaN, accelX: Number.POSITIVE_INFINITY }),
        STEP_MS,
      );
      const pose = run(motion, signals({ speed: fast }), 1);
      for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true);
    });
  },
);
