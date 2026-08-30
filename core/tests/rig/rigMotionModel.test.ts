import { describe, it, expect } from 'vitest';
import { RigMotionModel } from '../../src/rig/RigMotionModel';
import { Vector2 } from '../../src/math/Vector2';

const DT = 16;

describe('RigMotionModel', () => {
  it('sıfır niyette motion01 0 olur ama idlePhaseDeg ilerlemeye devam eder', () => {
    const model = new RigMotionModel();
    const first = model.update(Vector2.zero(), DT);
    expect(first.motion01).toBe(0);
    expect(first.idlePhaseDeg).toBeGreaterThan(0);

    const second = model.update(Vector2.zero(), DT);
    expect(second.idlePhaseDeg).toBeGreaterThan(first.idlePhaseDeg);
  });

  it('sabit yön niyetinde facingRad o açıya yakınsar', () => {
    const model = new RigMotionModel();
    const intent = new Vector2(1, 0);
    let signals = model.update(intent, DT);
    for (let i = 0; i < 200; i++) {
      signals = model.update(intent, DT);
    }
    expect(signals.facingRad).toBeCloseTo(0, 1);
    expect(signals.motion01).toBeCloseTo(1, 5);
  });

  it('sürdürülen hareket sonunda turnVelocityRadPerSec sıfıra söner', () => {
    const model = new RigMotionModel();
    const intent = new Vector2(0, 1);
    let signals = model.update(intent, DT);
    for (let i = 0; i < 200; i++) {
      signals = model.update(intent, DT);
    }
    expect(Math.abs(signals.turnVelocityRadPerSec)).toBeLessThan(0.05);
  });

  it('ani 180° yön değişiminde turnVelocityRadPerSec sıçrar sonra söner', () => {
    const model = new RigMotionModel();
    for (let i = 0; i < 60; i++) model.update(new Vector2(1, 0), DT);

    const justAfterFlip = model.update(new Vector2(-1, 0), DT);
    expect(Math.abs(justAfterFlip.turnVelocityRadPerSec)).toBeGreaterThan(0.1);

    let settled = justAfterFlip;
    for (let i = 0; i < 200; i++) settled = model.update(new Vector2(-1, 0), DT);
    expect(Math.abs(settled.turnVelocityRadPerSec)).toBeLessThan(0.05);
  });

  it('dead-zone altındaki niyette facing donar, sıfıra sıçramaz', () => {
    const model = new RigMotionModel();
    for (let i = 0; i < 60; i++) model.update(new Vector2(0, 1), DT);
    const moving = model.update(new Vector2(0, 1), DT);

    const idle = model.update(new Vector2(0.001, 0.001), DT);
    expect(idle.facingRad).toBeCloseTo(moving.facingRad, 5);
  });
});
