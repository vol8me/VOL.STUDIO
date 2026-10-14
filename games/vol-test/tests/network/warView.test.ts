import { describe, expect, it } from 'vitest';
import { WAR } from '@/config/war';
import { FactionState, NO_TEAM, PlayerState, WORLD_SCHEMA, ZoneState } from '@/network/schema';
import type { PlayerSnapshot, WorldSnapshot } from '@/network/schema';
import { feedLine, readWar } from '@/network/warView';

function player(patch: Partial<PlayerSnapshot>): PlayerSnapshot {
  const record = new PlayerState();
  Object.assign(record, patch);
  return record;
}

function world(players: PlayerSnapshot[]): WorldSnapshot {
  const state = new WORLD_SCHEMA();
  for (const record of players) state.players.set(`s${record.vehicleId}`, record);
  for (let index = 0; index < WAR.zones.length; index++) state.zones.push(new ZoneState());
  for (let index = 0; index < WAR.factions; index++) state.factions.push(new FactionState());
  return state;
}

describe('readWar', () => {
  it('sıralar: öldürme çok olan önce, eşitte ölümü az olan, sonra kimlik', () => {
    const view = readWar(
      world([
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

  it('kendi cephemizi, bot işaretini ve bağlantı durumunu satıra taşır', () => {
    const view = readWar(
      world([
        player({ vehicleId: 1, name: 'Ben', team: 1, connected: true }),
        player({ vehicleId: 2, name: 'Bot', team: 0, bot: true, connected: true }),
        player({ vehicleId: 3, name: 'Kopuk', team: 0 }),
      ]),
      1,
    );
    expect(view.selfFaction).toBe(1);
    const byName = new Map(view.rows.map((row) => [row.name, row]));
    expect(byName.get('Bot')).toMatchObject({ bot: true, connected: true, team: 0 });
    expect(byName.get('Kopuk')).toMatchObject({ bot: false, connected: false });
  });

  it('oyuncu kaydı yoksa cephe tanımsızdır', () => {
    expect(readWar(world([]), 7).selfFaction).toBe(NO_TEAM);
  });

  it('cepheleri ve bölgeleri sırasıyla, bölge kimliğini yapılandırmadan okur', () => {
    const state = world([]);
    state.factions[0].score = 12;
    state.factions[0].wins = 2;
    state.factions[0].zones = 3;
    state.factions[1].vehicles = 8;
    state.zones[1].owner = 1;
    state.zones[1].progress = -1;
    state.zones[2].contested = true;
    state.zones[2].presentFirst = 2;
    const view = readWar(state, 1);
    expect(view.dominance).toBe(WAR.score.dominance);
    expect(view.factions).toHaveLength(WAR.factions);
    expect(view.factions[0]).toMatchObject({ index: 0, score: 12, wins: 2, zones: 3 });
    expect(view.factions[1].vehicles).toBe(8);
    expect(view.zones).toHaveLength(WAR.zones.length);
    expect(view.zones.map((zone) => zone.id)).toEqual(WAR.zones.map((zone) => zone.id));
    expect(view.zones[1]).toMatchObject({ owner: 1, progress: -1 });
    expect(view.zones[2]).toMatchObject({ contested: true, presentFirst: 2 });
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
    expect(feedLine({ kind: 'joined', vehicleId: 1, name: 'Ben' }, 1, 0, nameOf)).toEqual({
      kind: 'joined',
      name: 'Ben',
      tone: 'info',
    });
    expect(feedLine({ kind: 'joined', vehicleId: 2, name: 'Rakip' }, 1, 0, nameOf)?.tone).toBe(
      'default',
    );
    expect(feedLine({ kind: 'left', vehicleId: 9, name: 'Gitti' }, 1, 0, nameOf)).toEqual({
      kind: 'left',
      name: 'Gitti',
      tone: 'default',
    });
  });

  it('öldürmeyi kime ait olduğuna göre tonlar; kaynaksız ölüm düşme satırıdır', () => {
    const kill = (source: number | undefined, target: number) =>
      feedLine({ kind: 'died', source, target, cause: 'projectile' }, 1, 0, nameOf);
    expect(kill(1, 2)).toEqual({ kind: 'kill', killer: 'Ben', victim: 'Rakip', tone: 'success' });
    expect(kill(2, 1)).toMatchObject({ killer: 'Rakip', victim: 'Ben', tone: 'danger' });
    expect(kill(2, 3)).toMatchObject({ kind: 'kill', tone: 'default' });
    expect(kill(undefined, 1)).toEqual({ kind: 'down', victim: 'Ben', tone: 'danger' });
    expect(kill(3, 3)).toEqual({ kind: 'down', victim: 'Üçüncü', tone: 'default' });
    expect(kill(42, 2)).toMatchObject({ killer: '?' });
  });

  it('boğulma nedeni düşme yerine boğuldu satırı verir', () => {
    const drown = (target: number) =>
      feedLine({ kind: 'died', source: undefined, target, cause: 'drown' }, 1, 0, nameOf);
    expect(drown(1)).toEqual({ kind: 'drowned', victim: 'Ben', tone: 'danger' });
    expect(drown(2)).toEqual({ kind: 'drowned', victim: 'Rakip', tone: 'default' });
  });

  it('bölge satırı kimlikle gelir; kendi cephemizin kazancı yeşil, kaybı kırmızıdır', () => {
    const zone = (owner: number, selfFaction: number) =>
      feedLine({ kind: 'zone', zone: 0, owner }, 1, selfFaction, nameOf);
    expect(zone(0, 0)).toEqual({ kind: 'zone', zone: WAR.zones[0].id, owner: 0, tone: 'success' });
    expect(zone(1, 0)?.tone).toBe('danger');
    // Tarafsızlaşma kimin lehine olduğunu söylemez; cephesiz izleyici de nötr görür.
    expect(zone(-1, 0)?.tone).toBe('info');
    expect(zone(0, NO_TEAM)?.tone).toBe('info');
  });

  it('bilinmeyen bölge indeksi güvenli bir kimliğe düşer', () => {
    expect(feedLine({ kind: 'zone', zone: 99, owner: 0 }, 1, 0, nameOf)).toMatchObject({
      zone: 'zone99',
    });
  });

  it('savaşın kazanılmasını bildirir', () => {
    expect(feedLine({ kind: 'warWon', faction: 1, wins: 3 }, 1, 1, nameOf)).toEqual({
      kind: 'warWon',
      faction: 1,
      wins: 3,
      tone: 'success',
    });
    expect(feedLine({ kind: 'warWon', faction: 1, wins: 3 }, 1, 0, nameOf)?.tone).toBe('danger');
    expect(feedLine({ kind: 'warWon', faction: 1, wins: 3 }, 1, NO_TEAM, nameOf)?.tone).toBe(
      'info',
    );
  });

  it('akışta görünmeyen olaylar satır üretmez', () => {
    expect(feedLine({ kind: 'respawned', target: 1, x: 0, y: 0 }, 1, 0, nameOf)).toBeUndefined();
  });
});
