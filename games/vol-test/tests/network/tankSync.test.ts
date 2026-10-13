import { describe, expect, it } from 'vitest';
import { PlayerState } from '@/network/schema';
import { readTankState, writeTankState } from '@/network/tankSync';
import { createTankState, TANK_STATE_FLAGS, TANK_STATE_NUMBERS } from '@/sim/tank/TankState';

/** Her sayısal alan ayrı ve float32'de temsil edilemeyen bir değer taşır. */
function distinct() {
  const state = createTankState();
  TANK_STATE_NUMBERS.forEach((key, index) => {
    state[key] = index + 0.1 + 1 / 3;
  });
  for (const key of TANK_STATE_FLAGS) state[key] = true;
  return state;
}

describe('tankSync', () => {
  it('yazılan durum okununca bit bit aynıdır', () => {
    const original = distinct();
    const record = new PlayerState();
    writeTankState(record, original);
    const copy = readTankState(record, createTankState());
    expect(copy).toEqual(original);
    for (const key of TANK_STATE_NUMBERS) {
      expect(Object.is(copy[key], original[key]), key).toBe(true);
      expect(copy[key], key).not.toBe(Math.fround(original[key]));
    }
  });

  it('okuma hedef nesneyi yeniden kullanır ve bayrakları da taşır', () => {
    const record = new PlayerState();
    writeTankState(record, distinct());
    const out = createTankState();
    expect(readTankState(record, out)).toBe(out);
    for (const key of TANK_STATE_FLAGS) expect(out[key], key).toBe(true);
  });

  it('yazma kayıt alanlarına (ad, skor, sağlık) dokunmaz', () => {
    const record = new PlayerState();
    record.name = 'Ada';
    record.kills = 3;
    record.health = 50;
    writeTankState(record, distinct());
    expect(record.name).toBe('Ada');
    expect(record.kills).toBe(3);
    expect(record.health).toBe(50);
  });
});
