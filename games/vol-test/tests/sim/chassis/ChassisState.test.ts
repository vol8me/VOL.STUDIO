import { describe, expect, it } from 'vitest';
import { SUSPENSION, TANK } from '@/config/tank';
import { Tank } from '@/sim/tank/Tank';
import {
  createChassisState,
  CHASSIS_STATE_FLAGS,
  CHASSIS_STATE_NUMBERS,
  CHASSIS_STATE_SNAPPED,
} from '@/sim/chassis/ChassisState';
import { commandAt } from '../../support/commands';
import { DT, world } from '../../support/sim';

function drive(tank: Tank, space: ReturnType<typeof world>, from: number, to: number): void {
  for (let step = from; step < to; step++) tank.step(commandAt(step), space, DT);
}

function fresh(): Tank {
  const tank = new Tank(TANK, SUSPENSION);
  tank.place(2048, 2048, 0);
  return tank;
}

describe('ChassisState', () => {
  it('anahtar listeleri durum biçimini eksiksiz ve tekrarsız kapsar', () => {
    const keys = [
      ...CHASSIS_STATE_NUMBERS,
      ...CHASSIS_STATE_FLAGS,
      ...CHASSIS_STATE_SNAPPED,
    ].sort();
    expect(keys).toEqual(Object.keys(createChassisState()).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('kırık parça maskesi durumla taşınır ve yeniden doğuşta temizlenir; ara değer listesinde değildir', () => {
    const tank = fresh();
    tank.parts = 0b10;
    const state = tank.captureState();
    expect(state.parts).toBe(0b10);
    const copy = fresh();
    copy.restoreState(state);
    expect(copy.parts).toBe(0b10);
    expect((CHASSIS_STATE_NUMBERS as readonly string[]).includes('parts')).toBe(false);
    copy.resetForRespawn(2048, 2048, 0);
    expect(copy.parts).toBe(0);
  });

  it('captureState her alanı doldurur ve hedef nesneyi yeniden kullanır', () => {
    const tank = fresh();
    drive(tank, world(), 0, 120);
    const out = createChassisState();
    expect(tank.captureState(out)).toBe(out);
    expect(out.x).toBe(tank.x);
    expect(out.hull).toBe(tank.hull);
    expect(out.turret).toBe(tank.turret);
    expect(out.boost).toBe(tank.boost);
    expect(out.pitch).toBe(tank.suspension.pitch);
    for (const key of CHASSIS_STATE_NUMBERS) expect(Number.isFinite(out[key])).toBe(true);
  });

  it('durumu geri yüklenen tank, kesintisiz süren tankla bit bit aynı ilerler', () => {
    const space = world();
    const original = fresh();
    drive(original, space, 0, 300);
    const state = original.captureState();
    const copy = fresh();
    copy.restoreState(state);
    expect(copy.captureState()).toEqual(state);

    drive(original, space, 300, 900);
    drive(copy, space, 300, 900);
    expect(copy.captureState()).toEqual(original.captureState());
  });

  it('her kesit noktasında geri yükleme gizli durum bırakmadığını gösterir', () => {
    const space = world();
    const original = fresh();
    let at = 0;
    for (const point of [20, 90, 173, 262, 355, 480, 611, 790]) {
      drive(original, space, at, point);
      at = point;
      const copy = fresh();
      copy.restoreState(original.captureState());
      const ahead = fresh();
      ahead.restoreState(original.captureState());
      drive(ahead, space, point, point + 240);
      drive(copy, space, point, point + 240);
      expect(copy.captureState(), `kesit ${point}`).toEqual(ahead.captureState());
    }
  });

  it('restoreState previous pozu yeni konuma çeker', () => {
    const tank = fresh();
    const state = createChassisState();
    Object.assign(state, tank.captureState(), { x: 900, y: 700 });
    tank.restoreState(state);
    expect(tank.previous.x).toBe(900);
    expect(tank.previous.y).toBe(700);
    expect(tank.contact.speed).toBe(0);
  });
});
