import { describe, expect, it } from 'vitest';
import { ARACHNID_RIG, arachnidMetadata } from '@/config/rigAssets';
import { GAIT } from '@/config/walkerView';
import { ArachnidMotion } from '@/view/walker/ArachnidMotion';
import { prepareArachnidRig, type ArachnidRig } from '@/view/walker/arachnidRig';
import type { LocomotionSignals } from '@/view/walker/signals';
import { bodySignals } from '../../support/locomotion';
import { assembleArachnid, rigScene } from '../../support/rigScene';

const TEMPO = GAIT.fullTempoSpeedPxPerSec;

function makeRig(): ArachnidRig {
  return prepareArachnidRig(arachnidMetadata, assembleArachnid(rigScene(ARACHNID_RIG)));
}

function drive(
  motion: ArachnidMotion,
  frames: number,
  overrides: Partial<LocomotionSignals> = {},
): { motion01: number; crouch01: number } {
  let signals = { motion01: 0, crouch01: 0 };
  // Dönen nesne ÖDÜNÇTÜR ve bir sonraki karede yeniden yazılır; kareler arasında kopyalanır.
  for (let i = 0; i < frames; i++) signals = { ...motion.update(bodySignals(overrides), 16) };
  return signals;
}

describe('ArachnidMotion', () => {
  it('gövde kabuğunu tek bir rijit grup gibi taşır', () => {
    const rig = makeRig();
    const [first, second] = rig.shellParts;
    const initialDistance = Math.hypot(second.x - first.x, second.y - first.y);
    const initialRotationGap = second.rotation - first.rotation;
    const motion = new ArachnidMotion(rig);

    drive(motion, 40, { speed: TEMPO * 0.5, accelX: 800 });
    drive(motion, 12, { speed: TEMPO * 0.5, accelX: -800 });

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
    const motion = new ArachnidMotion(makeRig());

    const idle = drive(motion, 200);
    expect(idle.crouch01).toBeGreaterThan(0.8);
    expect(idle.motion01).toBeCloseTo(0, 5);

    const walking = drive(motion, 200, { speed: TEMPO * 0.9 });
    expect(walking.motion01).toBeGreaterThan(0.9);
    expect(walking.crouch01).toBeLessThan(0.2);
  });

  it('ivmenin TERSİNE yaslanır: kalkışta geriye, frende öne kayar', () => {
    const rig = makeRig();
    const motion = new ArachnidMotion(rig);
    const shell = rig.shellParts[0];
    const heading = { facingHeadingRad: 0, travelHeadingRad: 0 };

    drive(motion, 30, { speed: TEMPO * 0.5, accelX: 1400, ...heading });
    const launching = shell.y;
    drive(motion, 30, { speed: TEMPO * 0.5, accelX: -1400, ...heading });
    const braking = shell.y;

    // Rig yerel uzayında ileri −y; +x'e hızlanırken gövde yerel +y'ye kayar.
    expect(launching).toBeGreaterThan(braking);
  });

  it('uç parçalar dönüşe gövdeden DAHA ÇOK yatar', () => {
    const rig = makeRig();
    const motion = new ArachnidMotion(rig);

    drive(motion, 60, { speed: TEMPO * 0.5, turnRateRadPerSec: 3 });

    expect(Math.abs(rig.snoutParts[0].rotation)).toBeGreaterThan(
      Math.abs(rig.shellParts[0].rotation),
    );
  });

  it('atılımda kabuk hareket ekseninde uzar', () => {
    const rig = makeRig();
    const motion = new ArachnidMotion(rig);
    drive(motion, 60, { speed: TEMPO, dash01: 1 });
    const shell = rig.shellParts[0] as unknown as { scaleX: number; scaleY: number };
    expect(shell.scaleY).toBeGreaterThan(shell.scaleX);
  });

  it('bakış yuvasının yarıçapını hiçbir karede aşmaz', () => {
    const rig = makeRig();
    const motion = new ArachnidMotion(rig);
    const restX = rig.gazePart.x;
    const restY = rig.gazePart.y;

    let moved = false;
    for (let i = 0; i < 900; i++) {
      motion.update(bodySignals({ speed: i % 300 < 150 ? 0 : TEMPO * 0.5 }), 16);
      const offset = Math.hypot(rig.gazePart.x - restX, rig.gazePart.y - restY);
      // Yaslanma ve salınım da katkı verdiği için sınır cömert; ölçülen bakışın yuvadan taşmamasıdır.
      expect(offset).toBeLessThan(24);
      if (offset > 1) moved = true;
    }
    expect(moved).toBe(true);
  });

  it('bozuk sinyal kabuğun dönüşümünü kalıcı NaN yapmaz', () => {
    const rig = makeRig();
    const motion = new ArachnidMotion(rig);
    drive(motion, 10, { speed: Number.NaN, accelX: Number.POSITIVE_INFINITY });
    drive(motion, 10, { speed: TEMPO * 0.5 });
    for (const part of rig.shellParts) expect(Number.isFinite(part.x)).toBe(true);
  });
});
