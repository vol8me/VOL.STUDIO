import type { MatchMode, MatchPhase } from '../src/network/schema';

/** Skorlanan oyuncu: şema örneği de, düz nesne de bu sözleşmeyi karşılar. */
export interface Participant {
  readonly vehicleId: number;
  readonly team: number;
  kills: number;
  deaths: number;
}

export type RulesEvent =
  { readonly kind: 'matchEnd'; readonly winner: string } | { readonly kind: 'matchStart' };

/** Kazananın anahtarı: takımsızda araç, takımlıda takım. Anahtar kimlik taşır, ad değil. */
export function winnerKey(mode: MatchMode, winner: { vehicleId: number; team: number }): string {
  return mode === 'teams' ? `t:${winner.team}` : `p:${winner.vehicleId}`;
}

/**
 * Maç kuralları: skor sayımı ve canlı/ara verme evreleri. Ağdan, fizikten ve Colyseus'tan
 * bağımsızdır; oda yalnız olayları besler ve dönen olayı yayınlar.
 */
export class MatchRules {
  phase: MatchPhase = 'live';
  intermissionMs = 0;
  winner = '';

  constructor(
    readonly mode: MatchMode,
    readonly scoreLimit: number,
    private readonly intermissionDurationMs: number,
  ) {
    if (!Number.isSafeInteger(scoreLimit) || scoreLimit < 1)
      throw new RangeError('Skor sınırı pozitif tam sayı olmalı.');
    if (!Number.isFinite(intermissionDurationMs) || intermissionDurationMs < 0)
      throw new RangeError('Ara verme süresi sonlu ve negatif olmayan sayı olmalı.');
  }

  /**
   * Bir ölümü işler. Ara vermede, kendi kendine ölümde (duvar, kaynaksız hasar) ve takım arkadaşı
   * öldürmede öldürme sayılmaz; ölen yine bir ölüm yazar. Sınıra ulaşan öldürme maçı bitirir.
   */
  recordDeath(
    victim: Participant,
    killer: Participant | undefined,
    everyone: Iterable<Participant>,
  ): RulesEvent | null {
    if (this.phase !== 'live') return null;
    victim.deaths++;
    if (!killer || killer === victim) return null;
    if (this.mode === 'teams' && killer.team === victim.team) return null;
    killer.kills++;
    return this.checkLimit(killer, everyone);
  }

  private checkLimit(killer: Participant, everyone: Iterable<Participant>): RulesEvent | null {
    const score = this.mode === 'teams' ? teamKills(everyone, killer.team) : killer.kills;
    if (score < this.scoreLimit) return null;
    this.phase = 'intermission';
    this.intermissionMs = this.intermissionDurationMs;
    this.winner = winnerKey(this.mode, killer);
    return { kind: 'matchEnd', winner: this.winner };
  }

  /** Ara verme sayacını ilerletir; süre bitince yeni maç başlar ve skorları sıfırlamak çağıranındır. */
  advance(stepMs: number): RulesEvent | null {
    if (this.phase !== 'intermission') return null;
    this.intermissionMs = Math.max(0, this.intermissionMs - stepMs);
    if (this.intermissionMs > 0) return null;
    this.phase = 'live';
    this.winner = '';
    return { kind: 'matchStart' };
  }
}

/** Takımın toplam öldürmesi. */
export function teamKills(everyone: Iterable<Participant>, team: number): number {
  let total = 0;
  for (const player of everyone) if (player.team === team) total += player.kills;
  return total;
}
