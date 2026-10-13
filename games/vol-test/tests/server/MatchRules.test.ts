import { describe, expect, it } from 'vitest';
import { MatchRules, teamKills, winnerKey, type Participant } from '../../server/MatchRules';

function player(vehicleId: number, team = -1): Participant {
  return { vehicleId, team, kills: 0, deaths: 0 };
}

describe('MatchRules oluşturma', () => {
  it('geçersiz sınırı ve süreyi reddeder', () => {
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expect(() => new MatchRules('ffa', limit, 1000)).toThrow(RangeError);
    }
    for (const duration of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new MatchRules('ffa', 3, duration)).toThrow(RangeError);
    }
  });
});

describe('MatchRules takımsız', () => {
  it('öldürme katile, ölüm kurbana yazılır', () => {
    const rules = new MatchRules('ffa', 3, 1000);
    const [a, b] = [player(1), player(2)];
    expect(rules.recordDeath(b, a, [a, b])).toBeNull();
    expect(a.kills).toBe(1);
    expect(b.deaths).toBe(1);
  });

  it('kaynaksız ve kendi kendine ölüm yalnız ölüm yazar', () => {
    const rules = new MatchRules('ffa', 3, 1000);
    const a = player(1);
    rules.recordDeath(a, undefined, [a]);
    rules.recordDeath(a, a, [a]);
    expect(a.kills).toBe(0);
    expect(a.deaths).toBe(2);
  });

  it('sınıra ulaşan öldürme maçı bitirir ve kazananı araç anahtarıyla bildirir', () => {
    const rules = new MatchRules('ffa', 2, 1000);
    const [a, b] = [player(1), player(2)];
    expect(rules.recordDeath(b, a, [a, b])).toBeNull();
    expect(rules.recordDeath(b, a, [a, b])).toEqual({ kind: 'matchEnd', winner: 'p:1' });
    expect(rules.phase).toBe('intermission');
    expect(rules.winner).toBe('p:1');
    expect(rules.intermissionMs).toBe(1000);
  });

  it('ara vermede ölüm sayılmaz', () => {
    const rules = new MatchRules('ffa', 1, 1000);
    const [a, b] = [player(1), player(2)];
    rules.recordDeath(b, a, [a, b]);
    expect(rules.phase).toBe('intermission');
    expect(rules.recordDeath(a, b, [a, b])).toBeNull();
    expect(b.kills).toBe(0);
    expect(a.deaths).toBe(0);
  });
});

describe('MatchRules takımlı', () => {
  it('takım arkadaşını öldürmek sayılmaz ama ölüm yazılır', () => {
    const rules = new MatchRules('teams', 5, 1000);
    const [a, b] = [player(1, 0), player(2, 0)];
    expect(rules.recordDeath(b, a, [a, b])).toBeNull();
    expect(a.kills).toBe(0);
    expect(b.deaths).toBe(1);
  });

  it('sınır takım toplamıdır ve kazanan takım anahtarıdır', () => {
    const rules = new MatchRules('teams', 3, 1000);
    const [a, b, c] = [player(1, 0), player(2, 0), player(3, 1)];
    const everyone = [a, b, c];
    expect(rules.recordDeath(c, a, everyone)).toBeNull();
    expect(rules.recordDeath(c, b, everyone)).toBeNull();
    expect(teamKills(everyone, 0)).toBe(2);
    expect(rules.recordDeath(c, a, everyone)).toEqual({ kind: 'matchEnd', winner: 't:0' });
  });
});

describe('MatchRules ara verme', () => {
  it('canlıyken ilerlemek hiçbir şey yapmaz', () => {
    const rules = new MatchRules('ffa', 1, 1000);
    expect(rules.advance(500)).toBeNull();
    expect(rules.phase).toBe('live');
  });

  it('süre dolunca yeni maç başlar ve kazanan temizlenir', () => {
    const rules = new MatchRules('ffa', 1, 1000);
    const [a, b] = [player(1), player(2)];
    rules.recordDeath(b, a, [a, b]);
    expect(rules.advance(400)).toBeNull();
    expect(rules.intermissionMs).toBe(600);
    expect(rules.advance(700)).toEqual({ kind: 'matchStart' });
    expect(rules.phase).toBe('live');
    expect(rules.winner).toBe('');
    expect(rules.intermissionMs).toBe(0);
  });
});

describe('winnerKey', () => {
  it('moda göre araç ya da takım anahtarı üretir', () => {
    expect(winnerKey('ffa', { vehicleId: 7, team: -1 })).toBe('p:7');
    expect(winnerKey('teams', { vehicleId: 7, team: 1 })).toBe('t:1');
  });
});
