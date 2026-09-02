import { describe, expect, it } from 'vitest';
import { prepareArachnidRig, type ArachnidRig } from '@/runtime/rig/arachnidRig';
import { ArachnidBodyMotion, type BodyMotionState } from '@/runtime/rig/ArachnidBodyMotion';
import {
  arachnidTestMetadata as metadata,
  assembleTestRig,
  buildTestRigDefinition,
  createFakeScene,
} from '../../support/phaserFakes';

function makeRig(): ArachnidRig {
  const definition = buildTestRigDefinition();
  return prepareArachnidRig(metadata, assembleTestRig(createFakeScene(definition), definition));
}

function state(overrides: Partial<BodyMotionState> = {}): BodyMotionState {
  return {
    speed: 0,
    accelX: 0,
    accelY: 0,
    turnRate: 0,
    facingRad: -Math.PI / 2,
    dash01: 0,
    ...overrides,
  };
}

function drive(
  motion: ArachnidBodyMotion,
  frames: number,
  overrides: Partial<BodyMotionState> = {},
): { motion01: number; crouch01: number } {
  let signals = { motion01: 0, crouch01: 0 };
  for (let i = 0; i < frames; i++) signals = motion.update(state(overrides), 16);
  return signals;
}

describe('ArachnidBodyMotion', () => {
  it('gövde kabuğunu tek bir rijit grup gibi taşır', () => {
    const rig = makeRig();
    const [first, second] = rig.shellParts;
    const initialDistance = Math.hypot(second.x - first.x, second.y - first.y);
    const initialRotationGap = second.rotation - first.rotation;
    const motion = new ArachnidBodyMotion(rig);

    drive(motion, 40, { speed: 200, accelX: 800 });
    drive(motion, 12, { speed: 200, accelX: -800 });

    const finalDistance = Math.hypot(second.x - first.x, second.y - first.y);
    // Ölçek çömelmeyle değişir; oran korunur, dolayısıyla mesafe orantılıdır.
    expect(finalDistance / initialDistance).toBeCloseTo(1, 1);
    expect(second.rotation - first.rotation).toBeCloseTo(initialRotationGap, 6);
    for (const part of rig.shellParts) {
      expect(Number.isFinite(part.x)).toBe(true);
      expect(Number.isFinite(part.y)).toBe(true);
      expect(Number.isFinite(part.rotation)).toBe(true);
    }
  });

  it('dururken çömelme dolar, yürürken açılır', () => {
    const motion = new ArachnidBodyMotion(makeRig());

    const idle = drive(motion, 200);
    expect(idle.crouch01).toBeGreaterThan(0.8);
    expect(idle.motion01).toBeCloseTo(0, 5);

    const walking = drive(motion, 200, { speed: 240 });
    expect(walking.motion01).toBeGreaterThan(0.9);
    expect(walking.crouch01).toBeLessThan(0.2);
  });

  it('ivmenin TERSİNE yaslanır: kalkışta geriye, frende öne kayar', () => {
    const rig = makeRig();
    const motion = new ArachnidBodyMotion(rig);
    const shell = rig.shellParts[0];

    drive(motion, 30, { speed: 200, accelX: 1400, facingRad: 0 });
    const launching = shell.y;

    drive(motion, 30, { speed: 200, accelX: -1400, facingRad: 0 });
    const braking = shell.y;

    // Rig yerel uzayında ileri −y; +x'e hızlanırken gövde yerel +y'ye kayar.
    expect(launching).toBeGreaterThan(braking);
  });

  it('uç parçalar dönüşe gövdeden DAHA ÇOK yatar', () => {
    const rig = makeRig();
    const motion = new ArachnidBodyMotion(rig);

    drive(motion, 60, { speed: 200, turnRate: 3 });

    const shellRotation = rig.shellParts[0].rotation;
    const snoutRotation = rig.snoutParts[0].rotation;
    expect(Math.abs(snoutRotation)).toBeGreaterThan(Math.abs(shellRotation));
  });

  it('bakış yuvasının yarıçapını hiçbir karede aşmaz', () => {
    const rig = makeRig();
    const motion = new ArachnidBodyMotion(rig);
    const restX = rig.gazePart.x;
    const restY = rig.gazePart.y;

    let moved = false;
    for (let i = 0; i < 900; i++) {
      motion.update(state({ speed: i % 300 < 150 ? 0 : 220 }), 16);
      const offset = Math.hypot(rig.gazePart.x - restX, rig.gazePart.y - restY);
      // Yaslanma ve salınım da katkı verdiği için sınır cömert tutulur;
      // ölçülen şey bakışın YUVASINDAN taşmamasıdır.
      expect(offset).toBeLessThan(24);
      if (offset > 1) moved = true;
    }
    expect(moved).toBe(true);
  });
});
