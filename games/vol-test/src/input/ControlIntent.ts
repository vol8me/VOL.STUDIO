import { damp } from '@volstudio/core/math';
import { CONTROLS } from '@/config/controls';
import { idleCommand, type TankCommand } from '@/sim/command';

/**
 * Ham tick komutunu oynanış komutuna çevirir.
 *
 * Ateş eşiği burada değil, çubuğun kendi durumunda (`TouchStickState`'in
 * giriş/çıkış histerezisi): eşik render karesinde örneklenirse tick'ten kısa
 * bir sapma, kendisini bildirmediği tick'te kaybolur.
 */
export class ControlIntent {
  readonly command = idleCommand();

  update(raw: TankCommand, stepMs: number): TankCommand {
    const moveX = damp(this.command.moveX, raw.moveX, CONTROLS.moveSmoothing, stepMs);
    const moveY = damp(this.command.moveY, raw.moveY, CONTROLS.moveSmoothing, stepMs);
    Object.assign(this.command, raw, { moveX, moveY });
    return this.command;
  }

  reset(): void {
    Object.assign(this.command, idleCommand());
  }
}
