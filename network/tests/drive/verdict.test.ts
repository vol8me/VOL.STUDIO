import { describe, expect, it } from 'vitest';
import { judgeFleet, observeServer, type FleetBudget, type FleetSummary } from '../../src/drive';

const BUDGET: FleetBudget = {
  clients: 4,
  maxJoinFailures: 0,
  maxDropped: 0,
  maxErrors: 0,
  maxActErrors: 0,
  joinP99Ms: 500,
  patchGapP99Ms: 100,
  pingP99Ms: 80,
  minPatchesPerSecond: 15,
  serverStepP95Ms: 4,
  serverLoopP99Ms: 20,
  serverEvictions: 0,
};

const distribution = (p99: number) => ({ count: 10, mean: p99 / 2, p50: p99 / 2, p99, max: p99 });

function summary(patch: Partial<FleetSummary> = {}): FleetSummary {
  return {
    clients: 4,
    joined: 4,
    joinFailures: {},
    dropped: 0,
    closeCodes: {},
    errors: 0,
    actErrors: 0,
    durationMs: 10_000,
    joinMs: distribution(200),
    patchGapMs: distribution(60),
    pingMs: distribution(30),
    patchesPerSecond: 20,
    messagesPerSecond: 1,
    ...patch,
  };
}

describe('judgeFleet', () => {
  it('ölçülmemiş gecikme sıfır ms başarı sayılamaz', () => {
    const result = judgeFleet(summary({ pingMs: { ...distribution(0), count: 0 } }), BUDGET, {
      stepP95Ms: 1,
      loopP99Ms: 1,
      evictions: 0,
    });
    expect(result.complete).toBe(false);
    expect(result.checks.find((item) => item.name === 'pingP99Ms')).toMatchObject({
      skipped: true,
      ok: false,
    });
  });

  it('sonlu olmayan veya negatif ölçüm bütçeyi geçmiş sayılmaz', () => {
    for (const ping of [-1, Infinity, NaN])
      expect(judgeFleet(summary({ pingMs: distribution(ping) }), BUDGET).pass).toBe(false);
  });

  it('bütçe içindeki koşu geçer; sunucu gözlemi yoksa sunucu maddeleri atlanır ve hüküm tamamlanmış sayılmaz', () => {
    const verdict = judgeFleet(summary(), BUDGET);
    expect(verdict.pass).toBe(true);
    expect(verdict.complete).toBe(false);
    expect(verdict.checks.filter((item) => item.skipped).map((item) => item.name)).toEqual([
      'serverStepP95Ms',
      'serverLoopP99Ms',
      'serverEvictions',
    ]);
    const full = judgeFleet(summary(), BUDGET, { stepP95Ms: 1, loopP99Ms: 2, evictions: 0 });
    expect(full.pass).toBe(true);
    expect(full.complete).toBe(true);
  });

  it('tavan aşımı ve taban altı ayrı madde olarak düşer; sınırın kendisi geçer', () => {
    const slow = judgeFleet(summary({ pingMs: distribution(81) }), BUDGET);
    expect(slow.pass).toBe(false);
    expect(slow.checks.find((item) => !item.ok)?.name).toBe('pingP99Ms');
    expect(judgeFleet(summary({ pingMs: distribution(80) }), BUDGET).pass).toBe(true);

    const starved = judgeFleet(summary({ patchesPerSecond: 14.9 }), BUDGET);
    expect(starved.checks.find((item) => !item.ok)).toMatchObject({
      name: 'patchesPerSecond',
      bound: 'min',
    });
    expect(judgeFleet(summary({ joined: 3 }), BUDGET).pass).toBe(false);
  });

  it('katılım hataları türüne bakılmadan toplanır; kopma ve hata sıfır bütçeyle düşürür', () => {
    expect(judgeFleet(summary({ joinFailures: { full: 1, failed: 1 } }), BUDGET).pass).toBe(false);
    expect(judgeFleet(summary({ dropped: 1 }), BUDGET).pass).toBe(false);
    expect(judgeFleet(summary({ errors: 1 }), BUDGET).pass).toBe(false);
    expect(judgeFleet(summary({ actErrors: 1 }), BUDGET).pass).toBe(false);
  });

  it('sunucunun en kötü değeri hükme girer', () => {
    const verdict = judgeFleet(summary(), BUDGET, { stepP95Ms: 5, loopP99Ms: 1, evictions: 0 });
    expect(verdict.pass).toBe(false);
    expect(verdict.checks.find((item) => !item.ok)?.name).toBe('serverStepP95Ms');
  });
});

describe('observeServer', () => {
  it('eksik veya bozuk ölçüm sıfır değere dönüşmez, hüküm eksik kalır', () => {
    const observation = observeServer([{ metrics: { loop: { p99Ms: 2 }, rooms: [null, {}] } }]);
    expect(observation).toEqual({ stepP95Ms: null, loopP99Ms: 2, evictions: null });
    expect(judgeFleet(summary(), BUDGET, observation).complete).toBe(false);
    expect(observeServer([{ metrics: { loop: { p99Ms: NaN }, rooms: [] } }])).toBeNull();
  });

  it('aynı ölçümde bütün odaların atımlarını toplar', () => {
    const observation = observeServer([
      { metrics: { rooms: [{ traffic: { evictions: 2 } }, { traffic: { evictions: 3 } }] } },
    ]);
    expect(observation?.evictions).toBe(5);
  });

  it('hiç adım ölçmemiş oda gecikmesi bilinmez kalır', () => {
    expect(observeServer([{ metrics: { rooms: [{ step: { count: 0, p95: 0 } }] } }])).toBeNull();
  });

  const sample = (step: number, loop: number, evictions: number) => ({
    t: 1,
    ev: 'server',
    metrics: { loop: { p99Ms: loop }, rooms: [{ step: { p95: step }, traffic: { evictions } }] },
  });

  it('örnekler arasında her değerin en kötüsünü alır', () => {
    expect(observeServer([sample(1, 5, 0), sample(3, 2, 1), sample(2, 9, 0)])).toEqual({
      stepP95Ms: 3,
      loopP99Ms: 9,
      evictions: 1,
    });
  });

  it('tanınmayan ya da boş girdide gözlem yoktur', () => {
    expect(observeServer([])).toBeNull();
    expect(observeServer([{ t: 1, ev: 'server' }, null, { metrics: 'x' }])).toBeNull();
  });
});
