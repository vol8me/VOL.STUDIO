import { describe, expect, it } from 'vitest';
import { feedLine, parseWinner, readMatch } from '@/network/matchView';
import {
  MATCH_SCHEMA,
  NO_TEAM,
  PlayerState,
  type MatchSnapshot,
  type PlayerSnapshot,
} from '@/network/schema';

function player(patch: Partial<PlayerSnapshot>): PlayerSnapshot {
  const record = new PlayerState();
  Object.assign(record, patch);
  return record;
}

function match(players: PlayerSnapshot[], patch: Partial<MatchSnapshot> = {}): MatchSnapshot {
  const state = new MATCH_SCHEMA();
  Object.assign(state, patch);
  for (const record of players) state.players.set(`s${record.vehicleId}`, record);
  return state;
}

describe('readMatch', () => {
  it('sıralar: öldürme çok olan önce, eşitte ölümü az olan, sonra kimlik', () => {
    const view = readMatch(
      match([
        player({ vehicleId: 3, name: 'C', kills: 2, deaths: 1 }),
        player({ vehicleId: 1, name: 'A', kills: 2, deaths: 4 }),
        player({ vehicleId: 2, name: 'B', kills: 5, deaths: 9 }),
        player({ vehicleId: 4, name: 'D', kills: 2, deaths: 1 }),
      ]),
      3,
    );
    expect(view.rows.map((row) => [row.name, row.rank])).toEqual([
      ['B', 1],
      ['C', 2],
      ['D', 3],
      ['A', 4],
    ]);
    expect(view.rows.filter((row) => row.self).map((row) => row.name)).toEqual(['C']);
  });

  it('takımsız maçta takım skoru yoktur ve bilinmeyen kip/evre güvenli varsayılana düşer', () => {
    const view = readMatch(
      match([player({ vehicleId: 1, kills: 4 })], {
        mode: 'garip',
        phase: 'garip',
        code: 'ABCDE',
        scoreLimit: 10,
      }),
      1,
    );
    expect(view).toMatchObject({ mode: 'ffa', phase: 'live', code: 'ABCDE', scoreLimit: 10 });
    expect(view.teamScores).toEqual([]);
  });

  it('takımlı maçta takım başına öldürmeleri toplar, takımsız oyuncuyu saymaz', () => {
    const view = readMatch(
      match(
        [
          player({ vehicleId: 1, team: 0, kills: 3 }),
          player({ vehicleId: 2, team: 1, kills: 2 }),
          player({ vehicleId: 3, team: 0, kills: 4 }),
          player({ vehicleId: 4, team: NO_TEAM, kills: 9 }),
        ],
        { mode: 'teams', phase: 'intermission', winner: 't:0', intermissionMs: 4200 },
      ),
      1,
    );
    expect(view).toMatchObject({
      mode: 'teams',
      phase: 'intermission',
      winner: 't:0',
      intermissionMs: 4200,
    });
    expect(view.teamScores).toEqual([7, 2]);
  });
});

describe('parseWinner', () => {
  it.each([
    ['p:7', { kind: 'player', id: 7 }],
    ['t:1', { kind: 'team', team: 1 }],
    ['', undefined],
    ['x:1', undefined],
    ['p:abc', undefined],
    ['p:-2', undefined],
    ['p:1.5', undefined],
  ])('%j → %j', (key, expected) => {
    expect(parseWinner(key)).toEqual(expected);
  });
});

describe('feedLine', () => {
  const names = new Map([
    [1, 'Ben'],
    [2, 'Rakip'],
    [3, 'Üçüncü'],
  ]);
  const nameOf = (id: number): string | undefined => names.get(id);

  it('katılma ve ayrılma olay adını taşır; kendi katılımımız bilgi tonudur', () => {
    expect(feedLine({ kind: 'joined', vehicleId: 1, name: 'Ben' }, 1, nameOf)).toEqual({
      kind: 'joined',
      name: 'Ben',
      tone: 'info',
    });
    expect(feedLine({ kind: 'joined', vehicleId: 2, name: 'Rakip' }, 1, nameOf)?.tone).toBe(
      'default',
    );
    expect(feedLine({ kind: 'left', vehicleId: 9, name: 'Gitti' }, 1, nameOf)).toEqual({
      kind: 'left',
      name: 'Gitti',
      tone: 'default',
    });
  });

  it('öldürmeyi kime ait olduğuna göre tonlar; kaynaksız ölüm düşme satırıdır', () => {
    const kill = (source: number | undefined, target: number) =>
      feedLine({ kind: 'died', source, target, cause: 'projectile' }, 1, nameOf);
    expect(kill(1, 2)).toEqual({ kind: 'kill', killer: 'Ben', victim: 'Rakip', tone: 'success' });
    expect(kill(2, 1)).toMatchObject({ killer: 'Rakip', victim: 'Ben', tone: 'danger' });
    expect(kill(2, 3)).toMatchObject({ kind: 'kill', tone: 'default' });
    expect(kill(undefined, 1)).toEqual({ kind: 'down', victim: 'Ben', tone: 'danger' });
    expect(kill(3, 3)).toEqual({ kind: 'down', victim: 'Üçüncü', tone: 'default' });
    expect(kill(42, 2)).toMatchObject({ killer: '?' });
  });

  it('yeni maçı bildirir; akışta görünmeyen olaylar satır üretmez', () => {
    expect(feedLine({ kind: 'matchStart' }, 1, nameOf)).toEqual({
      kind: 'matchStart',
      tone: 'info',
    });
    expect(feedLine({ kind: 'matchEnd', winner: 'p:1' }, 1, nameOf)).toBeUndefined();
    expect(feedLine({ kind: 'respawned', target: 1, x: 0, y: 0 }, 1, nameOf)).toBeUndefined();
  });
});
