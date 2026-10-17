import { Metadata } from '@colyseus/schema';
import { describe, expect, it } from 'vitest';
import {
  INPUT_RANGES,
  FactionState,
  WorldState,
  NO_TEAM,
  PlayerState,
  TankInput,
  ZoneState,
  toCommand,
  type TankInputFields,
} from '@/network/schema';
import {
  createChassisState,
  CHASSIS_STATE_FLAGS,
  CHASSIS_STATE_NUMBERS,
  CHASSIS_STATE_SNAPPED,
} from '@/sim/chassis/ChassisState';

/** Tankın dinamik durumu olmayan, oyuncu kaydına özgü alanlar. */
const RECORD_FIELDS = [
  'vehicleId',
  'model',
  'name',
  'team',
  'bot',
  'connected',
  'kills',
  'deaths',
  'health',
  'alive',
  'respawnMs',
  'protectionMs',
  'gunMs',
  'salvo',
];

const input = (patch: Partial<TankInputFields> = {}): TankInputFields => ({
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  fire: false,
  boost: false,
  brake: false,
  ...patch,
});

describe('PlayerState', () => {
  it('tank durumunun her alanını taşır, fazlasını yalnız kayıt alanları olarak', () => {
    const fields = Object.keys(Metadata.getFields(PlayerState) as Record<string, number>).sort();
    const tankKeys = Object.keys(createChassisState());
    expect(fields).toEqual([...tankKeys, ...RECORD_FIELDS].sort());
  });

  it('tank alanları ChassisState ile aynı türdedir ve sıfırdan başlar', () => {
    const state = new PlayerState();
    for (const key of CHASSIS_STATE_NUMBERS) expect(state[key], key).toBe(0);
    for (const key of CHASSIS_STATE_FLAGS) expect(state[key], key).toBe(false);
    for (const key of CHASSIS_STATE_SNAPPED) expect(state[key], key).toBe(0);
  });

  it('kayıt alanları tanımlı başlangıç değeriyle gelir', () => {
    const state = new PlayerState();
    expect(state.name).toBe('');
    expect(state.team).toBe(NO_TEAM);
    expect(state.bot).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.alive).toBe(false);
    for (const key of ['vehicleId', 'kills', 'deaths', 'health', 'respawnMs', 'protectionMs']) {
      expect(state[key as 'kills'], key).toBe(0);
    }
  });

  it('konum ve hız float64 taşır: kesme hatası yoktur', () => {
    const state = new PlayerState();
    state.x = 0.1 + 0.2;
    expect(state.x).toBe(0.1 + 0.2);
    expect(state.x).not.toBe(Math.fround(0.1 + 0.2));
  });
});

describe('WorldState', () => {
  it('alanlar tanımlı başlar: sayaçlar NaN olmaz', () => {
    const state = new WorldState();
    expect(state.tick).toBe(0);
    expect(state.timeMs).toBe(0);
    expect(state.players.size).toBe(0);
    expect(state.zones.length).toBe(0);
    expect(state.factions.length).toBe(0);
    state.tick++;
    state.timeMs += 1000 / 60;
    expect(Number.isFinite(state.tick + state.timeMs)).toBe(true);
  });

  it('maç alanları yoktur: dünya kalıcıdır', () => {
    const fields = Object.keys(Metadata.getFields(WorldState) as Record<string, number>).sort();
    expect(fields).toEqual(['factions', 'players', 'tick', 'timeMs', 'zones']);
  });
});

describe('ZoneState', () => {
  it('bölge tarafsız ve ilerlemesiz başlar', () => {
    const zone = new ZoneState();
    expect(zone.owner).toBe(-1);
    expect(zone.progress).toBe(0);
    expect(zone.contested).toBe(false);
    expect(zone.presentFirst).toBe(0);
    expect(zone.presentSecond).toBe(0);
  });
});

describe('FactionState', () => {
  it('cephe sayaçları sıfırdan başlar', () => {
    const faction = new FactionState();
    for (const key of ['score', 'wins', 'zones', 'vehicles', 'humans'] as const)
      expect(faction[key], key).toBe(0);
  });
});

describe('TankInput', () => {
  it('boş girdi sıfırdır ve hiçbir tuş basılı değildir', () => {
    const empty = new TankInput();
    expect(toCommand(empty)).toEqual({
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      fire: false,
      boost: false,
      brake: false,
    });
  });

  it('eksen aralıkları dört eksen için [-1, 1]dir', () => {
    expect(INPUT_RANGES).toEqual({
      moveX: [-1, 1],
      moveY: [-1, 1],
      aimX: [-1, 1],
      aimY: [-1, 1],
    });
  });
});

describe('toCommand', () => {
  it('birimden uzun hareketi yönünü koruyarak birime indirir, kısa olanı değiştirmez', () => {
    const long = toCommand(input({ moveX: 3, moveY: 4 }));
    expect(Math.hypot(long.moveX, long.moveY)).toBeCloseTo(1, 12);
    expect(long.moveX / long.moveY).toBeCloseTo(0.75, 12);
    const short = toCommand(input({ moveX: 0.3, moveY: -0.4 }));
    expect(short.moveX).toBe(0.3);
    expect(short.moveY).toBe(-0.4);
  });

  it('nişan ya yoktur ya da birim vektördür', () => {
    const half = toCommand(input({ aimX: 0.5 }));
    expect(half.aimX).toBe(1);
    expect(half.aimY).toBe(0);
    const diagonal = toCommand(input({ aimX: 2, aimY: 2 }));
    expect(Math.hypot(diagonal.aimX, diagonal.aimY)).toBeCloseTo(1, 12);
    const none = toCommand(input({ aimX: 1e-7, aimY: -1e-7 }));
    expect(none.aimX).toBe(0);
    expect(none.aimY).toBe(0);
  });

  it('tuş durumlarını aynen aktarır', () => {
    const pressed = toCommand(input({ fire: true, boost: true, brake: true }));
    expect(pressed).toMatchObject({ fire: true, boost: true, brake: true });
  });
});
