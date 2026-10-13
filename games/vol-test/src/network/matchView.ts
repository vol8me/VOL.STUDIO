import { NO_TEAM, type MatchMode, type MatchPhase, type MatchSnapshot } from './schema';
import type { NetEvent } from './events';

/** Skor tablosunun bir satırı. */
export interface BoardRow {
  readonly id: number;
  readonly name: string;
  /** Takımsız maçta `NO_TEAM`. */
  readonly team: number;
  readonly kills: number;
  readonly deaths: number;
  readonly connected: boolean;
  readonly self: boolean;
  /** 1'den başlayan sıra; eşit öldürmede ölümü az olan öne geçer. */
  readonly rank: number;
}

/** Maçın o anki görüntüsü: panel yalnız bunu okur, sunucu şemasını bilmez. */
export interface MatchView {
  readonly code: string;
  readonly mode: MatchMode;
  readonly phase: MatchPhase;
  readonly scoreLimit: number;
  readonly intermissionMs: number;
  /** Biten maçın kazanan anahtarı (`p:<araç>`, `t:<takım>`); yoksa boş. */
  readonly winner: string;
  readonly rows: readonly BoardRow[];
  /** Takımlı maçta takım başına toplam öldürme (indeks = takım); takımsızda boş. */
  readonly teamScores: readonly number[];
}

/** Kazanan anahtarının çözülmüş hâli. */
export type Winner =
  | { readonly kind: 'player'; readonly id: number }
  | { readonly kind: 'team'; readonly team: number };

export function parseWinner(key: string): Winner | undefined {
  const [kind, value] = key.split(':');
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0) return undefined;
  if (kind === 'p') return { kind: 'player', id };
  if (kind === 't') return { kind: 'team', team: id };
  return undefined;
}

/** Şema durumunu görüntüye çevirir; `selfId` kendi araç kimliğidir. */
export function readMatch(state: MatchSnapshot, selfId: number): MatchView {
  const rows: Omit<BoardRow, 'rank'>[] = [];
  state.players.forEach((player) => {
    rows.push({
      id: player.vehicleId,
      name: player.name,
      team: player.team,
      kills: player.kills,
      deaths: player.deaths,
      connected: player.connected,
      self: player.vehicleId === selfId,
    });
  });
  rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  const mode = state.mode === 'teams' ? 'teams' : 'ffa';
  const teamScores: number[] = [];
  if (mode === 'teams')
    for (const row of rows)
      if (row.team !== NO_TEAM) teamScores[row.team] = (teamScores[row.team] ?? 0) + row.kills;
  return {
    code: state.code,
    mode,
    phase: state.phase === 'intermission' ? 'intermission' : 'live',
    scoreLimit: state.scoreLimit,
    intermissionMs: state.intermissionMs,
    winner: state.winner,
    rows: rows.map((row, index) => ({ ...row, rank: index + 1 })),
    teamScores,
  };
}

/** Bildirim akışının bir satırı; metni panel dile göre kurar. */
export type FeedLine = (
  | { readonly kind: 'joined'; readonly name: string }
  | { readonly kind: 'left'; readonly name: string }
  | { readonly kind: 'kill'; readonly killer: string; readonly victim: string }
  | { readonly kind: 'down'; readonly victim: string }
  | { readonly kind: 'matchStart' }
) & {
  /** Oyuncuyu ilgilendiren satır vurgulanır. */
  readonly tone: 'default' | 'success' | 'danger' | 'info';
};

/**
 * Olayı akış satırına çevirir; akışta görünmeyen olay için `undefined`. `nameOf` araç adını verir;
 * ayrılmış oyuncunun adı olayın kendisinden gelir.
 */
export function feedLine(
  event: NetEvent,
  selfId: number,
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
    case 'matchStart':
      return { kind: 'matchStart', tone: 'info' };
    case 'died': {
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
    default:
      return undefined;
  }
}
