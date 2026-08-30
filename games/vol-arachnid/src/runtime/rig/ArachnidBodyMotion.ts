import type Phaser from 'phaser';
import { RigMotionModel, Spring1D, clamp, type Vector2 as Vec } from '@volstudio/core';
import { bodyMotionConfig } from '@/config/bodyMotion';

const DEG = Math.PI / 180;

interface RestTransform {
  part: Phaser.GameObjects.Container;
  x: number;
  y: number;
  rotation: number;
}

/** Gövde kabuğuna dönüş ataleti ve hafif ağırlık aktarımı uygular. */
export class ArachnidBodyMotion {
  private readonly motionModel = new RigMotionModel({
    facingSpring: bodyMotionConfig.signalFacingSpring,
    idlePhaseSpeedDegPerSec: bodyMotionConfig.idlePhaseSpeedDegPerSec,
  });
  private readonly swaySpring = new Spring1D();
  private readonly rollSpring = new Spring1D();
  private readonly rest: RestTransform[];

  constructor(parts: readonly Phaser.GameObjects.Container[]) {
    this.rest = parts.map((part) => ({
      part,
      x: part.x,
      y: part.y,
      rotation: part.rotation,
    }));
  }

  update(moveIntent: Vec, deltaMs: number): void {
    const signals = this.motionModel.update(moveIntent, deltaMs);
    const phaseRad = signals.idlePhaseDeg * DEG;
    const turn01 = clamp(
      signals.turnVelocityRadPerSec / bodyMotionConfig.turnVelocityForMaxRadPerSec,
      -1,
      1,
    );

    const swayTarget =
      Math.sin(phaseRad) *
        (bodyMotionConfig.idleSwayPx + bodyMotionConfig.walkSwayPx * signals.motion01) +
      turn01 * bodyMotionConfig.turnSwayPx;
    const rollTarget =
      (Math.sin(phaseRad) * bodyMotionConfig.walkRollDeg * signals.motion01 +
        turn01 * bodyMotionConfig.turnRollDeg) *
      DEG;

    const sway = this.swaySpring.update(swayTarget, deltaMs, bodyMotionConfig.transformSpring);
    const roll = this.rollSpring.update(rollTarget, deltaMs, bodyMotionConfig.transformSpring);
    const cos = Math.cos(roll);
    const sin = Math.sin(roll);

    for (const rest of this.rest) {
      rest.part.x = rest.x * cos - rest.y * sin + sway;
      rest.part.y = rest.x * sin + rest.y * cos;
      rest.part.rotation = rest.rotation + roll;
    }
  }
}
