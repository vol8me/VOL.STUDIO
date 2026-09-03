import type { LocomotionSignals, PoseSignals } from '@/runtime/entity/locomotionSignals';

/**
 * Test için gövde sinyalleri. Varsayılan: yerde duran, ileri (rig yerel −Y)
 * bakan, hareketsiz bir gövde.
 *
 * Sinyalleri her testte elle kurmak yerine tek bir yerden üretmek, sözleşme
 * büyüdüğünde testlerin toptan kırılmasını da engeller.
 */
export function bodySignals(overrides: Partial<LocomotionSignals> = {}): LocomotionSignals {
  const base: LocomotionSignals = {
    x: 0,
    y: 0,
    velX: 0,
    velY: 0,
    speed: 0,
    accelX: 0,
    accelY: 0,
    travelHeadingRad: -Math.PI / 2,
    facingHeadingRad: -Math.PI / 2,
    turnRateRadPerSec: 0,
    dash01: 0,
    grounded: true,
  };
  const signals = { ...base, ...overrides };
  // Hız verilip büyüklüğü verilmediyse tutarlı olsun: bir testin yalnız `velX`
  // yazıp `speed`i sıfır bırakması sessizce "duruyor" demek olurdu.
  if (
    overrides.speed === undefined &&
    (overrides.velX !== undefined || overrides.velY !== undefined)
  ) {
    signals.speed = Math.hypot(signals.velX, signals.velY);
  }
  return signals;
}

export function poseSignals(overrides: Partial<PoseSignals> = {}): PoseSignals {
  return { motion01: 0, crouch01: 0, ...overrides };
}
