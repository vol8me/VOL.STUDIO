import { damp } from '@volstudio/core/math';
import { CONTROLS } from '@/config/controls';
import { idleCommand, type TankCommand } from '@/sim/command';

export class ControlIntent {
  readonly command = idleCommand();
  private stickFiring = false;

  update(raw: TankCommand, deltaMs: number, touchAimMagnitude?: number): TankCommand {
    const moveX = damp(this.command.moveX, raw.moveX, CONTROLS.moveSmoothing, deltaMs);
    const moveY = damp(this.command.moveY, raw.moveY, CONTROLS.moveSmoothing, deltaMs);
    Object.assign(this.command, raw, { moveX, moveY });
    if (touchAimMagnitude !== undefined) {
      this.stickFiring =
        touchAimMagnitude >= (this.stickFiring ? CONTROLS.fireExit : CONTROLS.fireEnter);
      this.command.fire = raw.fire && this.stickFiring;
    } else {
      this.stickFiring = false;
    }
    return this.command;
  }

  reset(): void {
    Object.assign(this.command, idleCommand());
    this.stickFiring = false;
  }
}
