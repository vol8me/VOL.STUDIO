import { describe, expect, it } from 'vitest';
import { NETWORK } from '@/config/network';
import { isEventBatch, type NetEvent } from '@/network/events';

describe('olay paketi güven sınırı', () => {
  const events: NetEvent[] = [
    { kind: 'joined', vehicleId: 1, name: 'Pilot' },
    { kind: 'left', vehicleId: 1, name: 'Pilot' },
    { kind: 'fired', source: 1, mount: 0, x: 1, y: 2, angle: 0, vx: 3, vy: 4 },
    { kind: 'impact', owner: 1, surface: 'ground', x: 1, y: 2, angle: 0 },
    { kind: 'hit', owner: 1, target: 2, x: 1, y: 2, angle: 0 },
    { kind: 'damaged', target: 2, source: 1, cause: 'projectile', amount: 5, health: 95 },
    { kind: 'healed', target: 2, amount: 5, health: 100 },
    { kind: 'died', target: 2, cause: 'drown' },
    { kind: 'broke', target: 2, part: 0, x: 1, y: 2 },
    { kind: 'respawned', target: 2, x: 1, y: 2 },
    { kind: 'wallHit', source: 1, x: 1, y: 2, normalX: 1, normalY: 0, speed: 30 },
    { kind: 'collision', a: 1, b: 2, x: 1, y: 2, normalX: 1, normalY: 0, speed: 30 },
    { kind: 'zone', zone: 0, owner: -1 },
    { kind: 'warWon', faction: 0, wins: 1 },
  ];

  it('bütün tel olaylarını kabul eder, her sayısal alandaki bozulmayı reddeder', () => {
    expect(isEventBatch({ t: 0, events })).toBe(true);
    for (const event of events) {
      for (const [key, value] of Object.entries(event)) {
        if (typeof value !== 'number') continue;
        for (const bad of [NaN, Infinity, '5'])
          expect(isEventBatch({ t: 1, events: [{ ...event, [key]: bad }] })).toBe(false);
      }
    }
  });

  it('biçimsiz paket, bilinmeyen tür ve aşırı olay dizisi çizime ulaşamaz', () => {
    for (const value of [
      null,
      {},
      { t: NaN, events },
      { t: -1, events },
      { t: 1, events: [null] },
      { t: 1, events: [{ kind: 'toString' }] },
      { t: 1, events: [{ kind: 'joined', vehicleId: 1, name: 5 }] },
      { t: 1, events: [{ kind: 'impact', owner: 1, x: 1, y: 2, angle: 0, surface: 'bad' }] },
      { t: 1, events: [{ kind: 'died', target: 1, cause: 'bad' }] },
      { t: 1, events: Array(NETWORK.maxEventBatch + 1).fill(events[0]) },
    ])
      expect(isEventBatch(value)).toBe(false);
  });
});
