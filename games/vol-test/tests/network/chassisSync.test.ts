import { describe, expect, it } from 'vitest';
import { PlayerState } from '@/network/schema';
import { readChassisState, writeChassisState } from '@/network/chassisSync';
import {
  createChassisState,
  CHASSIS_STATE_FLAGS,
  CHASSIS_STATE_NUMBERS,
  CHASSIS_STATE_SNAPPED,
} from '@/sim/chassis/ChassisState';

/** Her sayısal alan ayrı ve float32'de temsil edilemeyen bir değer taşır. */
function distinct() {
  const state = createChassisState();
  CHASSIS_STATE_NUMBERS.forEach((key, index) => {
    state[key] = index + 0.1 + 1 / 3;
  });
  for (const key of CHASSIS_STATE_FLAGS) state[key] = true;
  state.parts = 0b1010_0101;
  return state;
}

describe('chassisSync', () => {
  it('yazılan durum okununca bit bit aynıdır', () => {
    const original = distinct();
    const record = new PlayerState();
    writeChassisState(record, original);
    const copy = readChassisState(record, createChassisState());
    expect(copy).toEqual(original);
    for (const key of CHASSIS_STATE_NUMBERS) {
      expect(Object.is(copy[key], original[key]), key).toBe(true);
      expect(copy[key], key).not.toBe(Math.fround(original[key]));
    }
  });

  it('kırık parça maskesi tamsayı olarak geçer', () => {
    const record = new PlayerState();
    writeChassisState(record, distinct());
    expect(record.parts).toBe(0b1010_0101);
    for (const key of CHASSIS_STATE_SNAPPED)
      expect(readChassisState(record, createChassisState())[key]).toBe(0b1010_0101);
  });

  it('okuma hedef nesneyi yeniden kullanır ve bayrakları da taşır', () => {
    const record = new PlayerState();
    writeChassisState(record, distinct());
    const out = createChassisState();
    expect(readChassisState(record, out)).toBe(out);
    for (const key of CHASSIS_STATE_FLAGS) expect(out[key], key).toBe(true);
  });

  it('yazma kayıt alanlarına (ad, skor, sağlık) dokunmaz', () => {
    const record = new PlayerState();
    record.name = 'Ada';
    record.kills = 3;
    record.health = 50;
    writeChassisState(record, distinct());
    expect(record.name).toBe('Ada');
    expect(record.kills).toBe(3);
    expect(record.health).toBe(50);
  });
});
