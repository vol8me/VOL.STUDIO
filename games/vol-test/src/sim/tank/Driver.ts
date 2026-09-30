import { clamp } from '@volstudio/core/math/interpolation';
import { angleDelta, wrapAngle } from '../angle';
import type { TankCommand } from '../command';
import type { TankConfig } from '@/config/tank';

const MOVE_DEAD_ZONE = 0.05;

/** Sürücünün iki palete istediği yüzey hızları (birim/s). */
export interface TrackTargets {
  left: number;
  right: number;
  /** İleri sürüş istendi mi (hızlanma yalnız ileride geçerlidir). */
  forward: boolean;
}

/**
 * Oyuncu niyetini palet hızına çeviren sürücü. Çubuk yönü ekrana göre hedef
 * rotadır; sürücü hedef hızı ve dönüş hızını seçer, paletlere fark olarak
 * dağıtır. Tankı hareket ettiren yine fiziktir: palet ancak zeminin
 * sürtünmesi kadar çeker, gövde kütlesi ve dönme direnci kadar tepki verir.
 */
export class Driver {
  reversing = false;

  constructor(private readonly config: TankConfig) {}

  plan(
    command: TankCommand,
    hull: number,
    angularVelocity: number,
    forwardSpeed: number,
    boosting: boolean,
    out: TrackTargets,
  ): TrackTargets {
    const config = this.config;
    const magnitude = Math.min(1, Math.hypot(command.moveX, command.moveY));
    let speed = 0;
    let turnRate = 0;
    if (magnitude > MOVE_DEAD_ZONE) {
      const desired = Math.atan2(command.moveY, command.moveX);
      const facing = Math.abs(angleDelta(hull, desired));
      this.reversing = this.reversing ? facing > config.reverseExit : facing > config.reverseEnter;
      const heading = this.reversing ? wrapAngle(desired + Math.PI) : desired;
      const error = angleDelta(hull, heading);
      const threshold = Math.cos(config.driveAngle);
      const alignment = Math.max(0, (Math.cos(error) - threshold) / (1 - threshold));
      const top = this.reversing
        ? -config.reverseSpeed
        : config.maxSpeed * (boosting ? config.boostMultiplier : 1);
      speed = top * magnitude * alignment * alignment;
      const speedRatio = Math.min(1, Math.abs(forwardSpeed) / config.maxSpeed);
      const turnLimit = config.maxTurnRate * (1 - (1 - config.turnRateAtSpeed) * speedRatio);
      turnRate = clamp(error * config.steerGain, -turnLimit, turnLimit);
    } else {
      this.reversing = false;
    }
    const correction = (turnRate - angularVelocity) * config.steerAssist;
    const spin = (turnRate + correction) * config.trackOffset;
    out.left = speed + spin;
    out.right = speed - spin;
    out.forward = speed > 0;
    return out;
  }
}
