import { TANK_STATE_FLAGS, TANK_STATE_NUMBERS, type TankState } from '@/sim/tank/TankState';
import type { PlayerSnapshot } from './schema';

/** Şemadaki oyuncu kaydı → tank durumu. Uzlaştırma ve uzak araç kurulumu bunu okur. */
export function readTankState(source: PlayerSnapshot, out: TankState): TankState {
  for (const key of TANK_STATE_NUMBERS) out[key] = source[key];
  for (const key of TANK_STATE_FLAGS) out[key] = source[key];
  return out;
}

/** Tank durumu → şemadaki oyuncu kaydı. Yalnız sunucu yazar. */
export function writeTankState(target: PlayerSnapshot, state: TankState): void {
  for (const key of TANK_STATE_NUMBERS) target[key] = state[key];
  for (const key of TANK_STATE_FLAGS) target[key] = state[key];
}
