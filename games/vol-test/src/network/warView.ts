import { WAR } from '@/config/war';
import type { NetEvent } from './events';
import { NO_TEAM, type WorldSnapshot } from './schema';

/** Skor tablosunun bir satırı. */
export interface BoardRow {
  readonly id: number;
  readonly name: string;
  /** Cephe indeksi; cepheye girmemiş kayıt için `NO_TEAM`. */
  readonly team: number;
  readonly kills: number;
  readonly deaths: number;
  readonly connected: boolean;
  readonly bot: boolean;
  readonly self: boolean;
  /** 1'den başlayan sıra; eşit öldürmede ölümü az olan öne geçer. */
  readonly rank: number;
}

/** Bir cephenin görüntüsü. */
export interface FactionView {
  readonly index: number;
  readonly score: number;
  readonly wins: number;
  readonly zones: number;
  readonly vehicles: number;
  readonly humans: number;
}

/** Bir bölgenin görüntüsü; konum ve yarıçap `WAR.zones` ile dünya ölçüsünden türer. */
export interface ZoneView {
  readonly index: number;
  readonly id: string;
  /** Sahip cephe; yoksa -1. */
  readonly owner: number;
  /** [-1, 1]: +1 tam 0. cephe, -1 tam 1. cephe. */
  readonly progress: number;
  readonly contested: boolean;
  readonly presentFirst: number;
  readonly presentSecond: number;
}

/** Savaşın o anki görüntüsü: panel yalnız bunu okur, sunucu şemasını bilmez. */
export interface WarView {
  readonly rows: readonly BoardRow[];
  readonly factions: readonly FactionView[];
  readonly zones: readonly ZoneView[];
  /** Oyuncunun cephesi; kayıt yoksa `NO_TEAM`. */
  readonly selfFaction: number;
  /** Savaşı kazandıran hâkimiyet puanı. */
  readonly dominance: number;
}

/** Şema durumunu görüntüye çevirir; `selfId` kendi araç kimliğidir. */
export function readWar(state: WorldSnapshot, selfId: number): WarView {
  const rows: Omit<BoardRow, 'rank'>[] = [];
  let selfFaction = NO_TEAM;
  state.players.forEach((player) => {
    const self = player.vehicleId === selfId;
    if (self) selfFaction = player.team;
    rows.push({
      id: player.vehicleId,
      name: player.name,
      team: player.team,
      kills: player.kills,
      deaths: player.deaths,
      connected: player.connected,
      bot: player.bot,
      self,
    });
  });
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  const factions: FactionView[] = [];
  state.factions.forEach((faction, index) =>
    factions.push({
      index,
      score: faction.score,
      wins: faction.wins,
      zones: faction.zones,
      vehicles: faction.vehicles,
      humans: faction.humans,
    }),
  );
  const zones: ZoneView[] = [];
  state.zones.forEach((zone, index) =>
    zones.push({
      index,
      id: WAR.zones[index]?.id ?? `zone${index}`,
      owner: zone.owner,
      progress: zone.progress,
      contested: zone.contested,
      presentFirst: zone.presentFirst,
      presentSecond: zone.presentSecond,
    }),
  );
  return {
    rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    factions,
    zones,
    selfFaction,
    dominance: WAR.score.dominance,
  };
}

/** Bildirim akışının bir satırı; metni panel dile göre kurar. */
export type FeedLine = (
  | { readonly kind: 'joined'; readonly name: string }
  | { readonly kind: 'left'; readonly name: string }
  | { readonly kind: 'kill'; readonly killer: string; readonly victim: string }
  | { readonly kind: 'down'; readonly victim: string }
  /** Suda boğuldu: kaynaksız ölümün nedeni gölse düşme yerine bu satır yazılır. */
  | { readonly kind: 'drowned'; readonly victim: string }
  /** Bölge sahip değiştirdi; `owner` -1 ise tarafsızlaştı. */
  | { readonly kind: 'zone'; readonly zone: string; readonly owner: number }
  | { readonly kind: 'warWon'; readonly faction: number; readonly wins: number }
) & {
  /** Oyuncuyu ilgilendiren satır vurgulanır. */
  readonly tone: 'default' | 'success' | 'danger' | 'info';
};

/**
 * Olayı akış satırına çevirir; akışta görünmeyen olay için `undefined`. `nameOf` araç adını verir;
 * ayrılmış oyuncunun adı olayın kendisinden gelir. `selfFaction`, bölge ve zafer satırlarının
 * tonunu belirler: kendi cephenin kazancı yeşil, kaybı kırmızıdır.
 */
export function feedLine(
  event: NetEvent,
  selfId: number,
  selfFaction: number,
  nameOf: (vehicleId: number) => string | undefined,
): FeedLine | undefined {
  const who = (id: number): string => nameOf(id) ?? '?';
  switch (event.kind) {
    case 'joined':
      return {
        kind: 'joined',
        name: event.name,
        tone: event.vehicleId === selfId ? 'info' : 'default',
      };
    case 'left':
      return { kind: 'left', name: event.name, tone: 'default' };
    case 'died': {
      if (event.cause === 'drown')
        return {
          kind: 'drowned',
          victim: who(event.target),
          tone: event.target === selfId ? 'danger' : 'default',
        };
      if (event.source === undefined || event.source === event.target)
        return {
          kind: 'down',
          victim: who(event.target),
          tone: event.target === selfId ? 'danger' : 'default',
        };
      return {
        kind: 'kill',
        killer: who(event.source),
        victim: who(event.target),
        tone: event.source === selfId ? 'success' : event.target === selfId ? 'danger' : 'default',
      };
    }
    case 'zone': {
      const zone = WAR.zones[event.zone]?.id ?? `zone${event.zone}`;
      // Tarafsızlaşma kimin lehine olduğunu söylemez (önceki sahip olayda yok): nötr kalır.
      const known = selfFaction !== NO_TEAM && event.owner !== -1;
      const tone = !known ? 'info' : event.owner === selfFaction ? 'success' : 'danger';
      return { kind: 'zone', zone, owner: event.owner, tone };
    }
    case 'warWon':
      return {
        kind: 'warWon',
        faction: event.faction,
        wins: event.wins,
        tone:
          selfFaction === NO_TEAM ? 'info' : event.faction === selfFaction ? 'success' : 'danger',
      };
    default:
      return undefined;
  }
}
