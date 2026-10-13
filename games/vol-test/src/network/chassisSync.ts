import {
  CHASSIS_STATE_FLAGS,
  CHASSIS_STATE_NUMBERS,
  type ChassisState,
} from '@/sim/chassis/ChassisState';
import type { PlayerSnapshot } from './schema';

/** Şemadaki oyuncu kaydı → tank durumu. Uzlaştırma ve uzak araç kurulumu bunu okur. */
export function readChassisState(source: PlayerSnapshot, out: ChassisState): ChassisState {
  for (const key of CHASSIS_STATE_NUMBERS) out[key] = source[key];
  for (const key of CHASSIS_STATE_FLAGS) out[key] = source[key];
  return out;
}

/** Tank durumu → şemadaki oyuncu kaydı. Yalnız sunucu yazar. */
export function writeChassisState(target: PlayerSnapshot, state: ChassisState): void {
  for (const key of CHASSIS_STATE_NUMBERS) target[key] = state[key];
  for (const key of CHASSIS_STATE_FLAGS) target[key] = state[key];
}
