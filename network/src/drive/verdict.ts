import type { FleetSummary } from './fleet';

/**
 * Bir yük koşusunun bütçesi. Sayılar oyunun `quality.json` `fleetBudget` kaydından gelir; burada
 * değer yazılmaz. Tavanlar (`*Max*`, `*P99Ms`) aşılınca, tabanlar (`min*`) altına düşülünce koşu düşer.
 * Sunucu alanları yalnız sunucu gözlemi (`/metrics`) verildiğinde denetlenir; verilmediyse atlanır ve
 * hükümde `skipped` görünür.
 */
export interface FleetBudget {
  /** Katılması beklenen istemci sayısı: `joined` bundan azsa düşer. */
  readonly clients: number;
  readonly maxJoinFailures: number;
  readonly maxDropped: number;
  readonly maxErrors: number;
  readonly maxActErrors: number;
  readonly joinP99Ms: number;
  readonly patchGapP99Ms: number;
  readonly pingP99Ms: number;
  readonly minPatchesPerSecond: number;
  readonly serverStepP95Ms: number;
  readonly serverLoopP99Ms: number;
  readonly serverEvictions: number;
}

/** Sunucunun `/metrics` çıktısından türetilen, koşu boyunca görülen en kötü değerler. */
export interface ServerObservation {
  readonly stepP95Ms: number;
  readonly loopP99Ms: number;
  readonly evictions: number;
}

export interface VerdictCheck {
  readonly name: string;
  readonly ok: boolean;
  /** Ölçülen değer; sunucu gözlemi yoksa `null`. */
  readonly value: number | null;
  readonly limit: number;
  /** `max`: değer sınırı aşmamalı; `min`: değer sınırın altına düşmemeli. */
  readonly bound: 'max' | 'min';
  /** Gözlem olmadığı için denetlenmedi; `ok` bu durumda `true` sayılmaz, hüküm `complete` ile ayrılır. */
  readonly skipped: boolean;
}

export interface Verdict {
  /** Denetlenen her madde geçti. Atlanan madde varsa `complete` yanlıştır. */
  readonly pass: boolean;
  /** Tüm maddeler denetlendi (sunucu gözlemi verildi). */
  readonly complete: boolean;
  readonly checks: readonly VerdictCheck[];
}

/** Bir `/metrics` yanıtından koşunun en kötü sunucu değerlerini çıkarır; biçim tanınmazsa `null`. */
export function observeServer(metrics: readonly unknown[]): ServerObservation | null {
  let stepP95Ms = 0;
  let loopP99Ms = 0;
  let evictions = 0;
  let seen = false;
  for (const entry of metrics) {
    const body = (entry as { metrics?: Record<string, unknown> } | null)?.metrics;
    if (!body || typeof body !== 'object') continue;
    const loop = (body.loop as { p99Ms?: unknown } | undefined)?.p99Ms;
    const rooms = Array.isArray(body.rooms) ? body.rooms : [];
    if (typeof loop === 'number') {
      loopP99Ms = Math.max(loopP99Ms, loop);
      seen = true;
    }
    for (const room of rooms) {
      const step = (room as { step?: { p95?: unknown } }).step?.p95;
      const traffic = (room as { traffic?: { evictions?: unknown } }).traffic?.evictions;
      if (typeof step === 'number') {
        stepP95Ms = Math.max(stepP95Ms, step);
        seen = true;
      }
      if (typeof traffic === 'number') evictions = Math.max(evictions, traffic);
    }
  }
  return seen ? { stepP95Ms, loopP99Ms, evictions } : null;
}

function check(
  name: string,
  value: number | null,
  limit: number,
  bound: 'max' | 'min',
): VerdictCheck {
  if (value === null) return { name, ok: false, value, limit, bound, skipped: true };
  const ok = bound === 'max' ? value <= limit : value >= limit;
  return { name, ok, value, limit, bound, skipped: false };
}

const sum = (record: Readonly<Record<string, number>>): number =>
  Object.values(record).reduce((total, count) => total + count, 0);

/**
 * Koşu özetini bütçeye karşı yargılar. Madde adları sabittir ve raporda ve CLI çıktısında aynen
 * görünür; sunucu gözlemi yoksa sunucu maddeleri `skipped` olur ve `complete` yanlış kalır.
 */
export function judgeFleet(
  summary: FleetSummary,
  budget: FleetBudget,
  server: ServerObservation | null = null,
): Verdict {
  const checks: VerdictCheck[] = [
    check('joined', summary.joined, budget.clients, 'min'),
    check('joinFailures', sum(summary.joinFailures), budget.maxJoinFailures, 'max'),
    check('dropped', summary.dropped, budget.maxDropped, 'max'),
    check('errors', summary.errors, budget.maxErrors, 'max'),
    check('actErrors', summary.actErrors, budget.maxActErrors, 'max'),
    check('joinP99Ms', summary.joinMs.p99, budget.joinP99Ms, 'max'),
    check('patchGapP99Ms', summary.patchGapMs.p99, budget.patchGapP99Ms, 'max'),
    check('pingP99Ms', summary.pingMs.p99, budget.pingP99Ms, 'max'),
    check('patchesPerSecond', summary.patchesPerSecond, budget.minPatchesPerSecond, 'min'),
    check('serverStepP95Ms', server?.stepP95Ms ?? null, budget.serverStepP95Ms, 'max'),
    check('serverLoopP99Ms', server?.loopP99Ms ?? null, budget.serverLoopP99Ms, 'max'),
    check('serverEvictions', server?.evictions ?? null, budget.serverEvictions, 'max'),
  ];
  const checked = checks.filter((item) => !item.skipped);
  return {
    pass: checked.every((item) => item.ok),
    complete: checks.every((item) => !item.skipped),
    checks,
  };
}
