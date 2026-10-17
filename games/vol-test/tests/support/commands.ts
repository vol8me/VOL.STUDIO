import type { TankCommand } from '@/sim/command';
import { command } from './sim';

/** Tekrarlanabilir, çeşitli komut akışı: yön, nişan, ateş, hızlanma ve fren değişir. */
export function commandAt(step: number): TankCommand {
  const phase = Math.floor(step / 45) % 8;
  return command({
    moveX: Math.cos(phase * 0.9),
    moveY: Math.sin(phase * 0.9),
    aimX: phase % 3 === 0 ? 0 : Math.cos(step / 70),
    aimY: phase % 3 === 0 ? 0 : Math.sin(step / 70),
    fire: step % 37 === 0,
    boost: phase === 2 || phase === 5,
    brake: phase === 7,
  });
}
