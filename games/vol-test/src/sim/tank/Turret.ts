import { rotateTowards } from '@volstudio/core/math';
import type { TankCommand } from '../command';

export interface TurretConfig {
  readonly turretTurnRate: number;
}

export class Turret {
  angle = 0;

  constructor(private readonly config: TurretConfig) {}

  reset(angle: number): void {
    this.angle = angle;
  }

  update(command: TankCommand, dt: number): void {
    if (command.aimX === 0 && command.aimY === 0) return;
    this.angle = rotateTowards(
      this.angle,
      Math.atan2(command.aimY, command.aimX),
      this.config.turretTurnRate * dt,
    );
  }
}
