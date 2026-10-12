import { describe, expect, it } from 'vitest';
import { readRoomState } from '@/network/roomState';

const player = {
  vehicleId: 1,
  x: 110,
  y: 220,
  hull: 0.1,
  turret: 0.5,
  health: 64,
  maxHealth: 100,
  alive: true,
  respawnRemainingMs: 0,
};

describe('Colyseus dünya karesi', () => {
  it('Map/MapSchema biçimini okur, uzak araç kimliği ve canını taşır', () => {
    const state = {
      tick: 42,
      players: new Map([
        ['local', player],
        ['remote', { ...player, vehicleId: 2, health: 0, alive: false, respawnRemainingMs: 1500 }],
      ]),
    };
    expect(readRoomState(state)).toEqual({
      tick: 42,
      players: [
        { sessionId: 'local', ...player },
        {
          sessionId: 'remote',
          ...player,
          vehicleId: 2,
          health: 0,
          alive: false,
          respawnRemainingMs: 1500,
        },
      ],
    });
  });

  it('başsız ve bozuk durumları reddeder; geçersiz oyuncuyu kareden çıkarır', () => {
    expect(readRoomState(null)).toBeNull();
    expect(readRoomState({ tick: -1, players: new Map() })).toBeNull();
    expect(readRoomState({ tick: 0, players: [] })).toBeNull();
    expect(
      readRoomState({ tick: 2, players: new Map([['broken', { ...player, x: NaN }]]) }),
    ).toEqual({ tick: 2, players: [] });
    expect(
      readRoomState({ tick: 2, players: new Map([['broken', { ...player, health: 1000 }]]) }),
    ).toEqual({ tick: 2, players: [] });
  });
});
