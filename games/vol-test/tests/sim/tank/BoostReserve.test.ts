import { describe, expect, it } from 'vitest';
import { BoostReserve } from '@/sim/tank/BoostReserve';

const config = { boostCapacity: 10, boostDrain: 10, boostRegen: 5, boostRestart: 4 };

describe('BoostReserve', () => {
  it('istendikçe tükenir, istenmezken dolar ve taşmaz', () => {
    const reserve = new BoostReserve(config);
    reserve.update(true, 0.5);
    expect(reserve.active).toBe(true);
    expect(reserve.energy).toBe(5);
    reserve.update(false, 10);
    expect(reserve.energy).toBe(10);
  });

  it('tükenen depo eşiğe kadar dolmadan açılmaz', () => {
    const reserve = new BoostReserve(config);
    reserve.update(true, 1);
    expect(reserve.energy).toBe(0);
    reserve.update(true, 0.1);
    expect(reserve.active).toBe(false);
    reserve.update(false, 0.7);
    reserve.update(true, 0.01);
    expect(reserve.active).toBe(false);
    reserve.update(false, 0.2);
    reserve.update(true, 0.01);
    expect(reserve.active).toBe(true);
  });
});
