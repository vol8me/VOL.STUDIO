import { rotateTowards } from '@volstudio/core/math';
import type { TankCommand } from '../command';

export interface TurretConfig {
  /** Azami dönüş hızı (rad/s). */
  readonly turretTurnRate: number;
  /** Nişan bırakıldıktan sonra gövde yönüne dönmeden önceki bekleme (s). */
  readonly turretRestDelay: number;
}

/**
 * Stabilizatörlü taret: açı dünya eksenindedir, gövde dönerken nişan korunur.
 * Nişan varsa ona sınırlı hızla döner; nişan bırakılınca bekleyip gövde
 * yönüne döner.
 */
export class Turret {
  angle = 0;
  private aimIdle = Number.POSITIVE_INFINITY;

  constructor(private readonly config: TurretConfig) {}

  reset(angle: number): void {
    this.angle = angle;
    this.aimIdle = Number.POSITIVE_INFINITY;
  }

  update(command: TankCommand, hull: number, dt: number): void {
    const aiming = command.aimX !== 0 || command.aimY !== 0;
    let target = this.angle;
    if (aiming) {
      target = Math.atan2(command.aimY, command.aimX);
      this.aimIdle = 0;
    } else {
      this.aimIdle += dt;
      if (this.aimIdle >= this.config.turretRestDelay) target = hull;
    }
    this.angle = rotateTowards(this.angle, target, this.config.turretTurnRate * dt);
  }
}
