import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * UI maliyet/gecikme raporu şeması (VERIFICATION.md "UI CPU, GPU, ekrana sunum ve
 * gecikme deneyi"). Amaç ölçümü yapmak kadar, ölçülemeyeni ya da yalnız
 * yaklaşık ölçüleni PASS'e çevirmemektir:
 *
 * - her kapsam (`uiJs`, stil/yerleşim/çizim, GPU, ekrana sunum, girdi türleri)
 *   ayrı durum taşır: `measured` / `unsupported` / `not-run`; desteklenmeyen ölçü
 *   `0`a ya da başka kapsamın değerine çevrilmez;
 * - ölçülen kapsam `basis` ile dayanağını söyler: `presented` (ekrana sunulan
 *   kare) dışındaki dayanak (`js-sync`, `event-to-raf`) PASS'e yetmez;
 * - A/A gürültü payı `0.05F`i aşarsa ölçüm yetersizdir, tolerans yükseltilmez;
 * - farklı ölçülerin p95'leri toplanmaz: tek bir "UI %" alanı yoktur.
 *
 * Verdict önceliği: invalid > fail > insufficient > incomplete > pass.
 */
export const SCOPE_NAMES = [
  'uiJs',
  'styleLayoutPaint',
  'gpu',
  'presentation',
  'inputPointer',
  'inputKeyboard',
  'inputGamepad',
  'inputAssistive',
] as const;
export type ScopeName = (typeof SCOPE_NAMES)[number];

export type Basis = 'presented' | 'js-sync' | 'event-to-raf';

export interface Distribution {
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  /** p95'in %95 üst güven sınırı (bootstrap, sabit tohum). */
  readonly ci95Upper: number;
}

export interface Scope {
  readonly status: 'measured' | 'unsupported' | 'not-run';
  readonly reason?: string;
  readonly basis?: Basis;
  readonly distribution?: Distribution;
}

export interface UiPerfReport {
  readonly schema: 'UiPerfReportV1';
  readonly engine: string;
  readonly hz: number | null;
  /** F = 1000/Hz; Hz bilinmiyorsa `null` (kabul eşiği hesaplanamaz). */
  readonly frameBudgetMs: number | null;
  /**
   * `performance.now` çözünürlüğü (ms). Tarayıcı zamanlayıcıyı kuantalar; A/A
   * gürültüsü bunun altına inemez, bu yüzden etkin gürültü ikisinin büyüğüdür
   * (0 gürültü "ölçüm kusursuz" değil, "çözünürlük altında" demektir).
   */
  readonly timerResolutionMs: number;
  readonly scopes: Readonly<Record<ScopeName, Scope>>;
  readonly aa: { readonly samples: number; readonly noiseMs: number } | null;
}

export type Verdict = 'pass' | 'fail' | 'insufficient' | 'incomplete' | 'invalid';

/** UI CPU p95 kabulünün paydası: hedef kare süresinin %5'i. */
export const UI_CPU_FRACTION = 0.05;
/** Girdi→ilk görünür geri bildirim p95 sınırı (ms). */
export const INPUT_P95_LIMIT_MS = 100;

const INPUT_SCOPES: readonly ScopeName[] = ['inputPointer', 'inputKeyboard'];

function percentile(sorted: readonly number[], fraction: number): number {
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** mulberry32: bootstrap tekrarlanabilir olsun diye sabit tohumlu. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) throw new Error('dağılım için örnek yok');
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error('dağılım örneği sonlu değil (NaN/undefined 0 sayılmaz)');
  const sorted = [...values].sort((a, b) => a - b);
  const random = seeded(0x5eed);
  const p95s: number[] = [];
  for (let round = 0; round < 1000; round += 1) {
    const resample = Array.from(
      { length: sorted.length },
      () => sorted[Math.floor(random() * sorted.length)],
    ).sort((a, b) => a - b);
    p95s.push(percentile(resample, 0.95));
  }
  p95s.sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    ci95Upper: percentile(p95s, 0.95),
  };
}

/** Rapor biçimi hataları: kural ihlalleri değil, ölçüm kaydının kendisi bozuk. */
export function validateReport(report: UiPerfReport): string[] {
  const problems: string[] = [];
  if (report.schema !== 'UiPerfReportV1') problems.push('şema UiPerfReportV1 değil');
  if (report.hz !== null && !(Number.isFinite(report.hz) && report.hz > 0))
    problems.push('hz sonlu pozitif sayı ya da null olmalı');
  if (report.hz === null) {
    if (report.frameBudgetMs !== null) problems.push('hz yokken frameBudgetMs de null olmalı');
  } else if (
    report.frameBudgetMs === null ||
    Math.abs(report.frameBudgetMs - 1000 / report.hz) > 1e-6
  ) {
    problems.push('frameBudgetMs 1000/hz ile tutarlı olmalı');
  }
  if (!(Number.isFinite(report.timerResolutionMs) && report.timerResolutionMs >= 0))
    problems.push('zamanlayıcı çözünürlüğü sonlu ve ≥0 olmalı');
  if (report.aa !== null && !(Number.isFinite(report.aa.noiseMs) && report.aa.noiseMs >= 0))
    problems.push('A/A gürültü payı sonlu ve ≥0 olmalı');
  for (const name of SCOPE_NAMES) {
    const scope = report.scopes[name] as Scope | undefined;
    if (!scope) {
      problems.push(`${name}: kapsam eksik`);
      continue;
    }
    if (scope.status === 'measured') {
      const d = scope.distribution;
      if (!d || d.samples < 1) problems.push(`${name}: ölçüldü ama örnek yok`);
      else if (
        ![d.p50, d.p95, d.p99, d.max, d.ci95Upper].every(Number.isFinite) ||
        !(d.p50 <= d.p95 && d.p95 <= d.p99 && d.p99 <= d.max)
      )
        problems.push(`${name}: dağılım sonlu ve p50≤p95≤p99≤max olmalı`);
      if (!scope.basis) problems.push(`${name}: ölçüm dayanağı (basis) eksik`);
    } else if (scope.status === 'unsupported' || scope.status === 'not-run') {
      if (!scope.reason?.trim()) problems.push(`${name}: ${scope.status} için gerekçe yok`);
      if (scope.distribution) problems.push(`${name}: ${scope.status} kapsam değer taşıyamaz`);
    } else {
      problems.push(`${name}: bilinmeyen durum`);
    }
  }
  return problems;
}

export function judge(report: UiPerfReport): { verdict: Verdict; reasons: string[] } {
  const invalid = validateReport(report);
  if (invalid.length) return { verdict: 'invalid', reasons: invalid };

  const failures: string[] = [];
  const insufficient: string[] = [];
  const incomplete: string[] = [];
  const budget = report.frameBudgetMs;
  const limit = budget === null ? null : UI_CPU_FRACTION * budget;
  const noise = report.aa === null ? null : Math.max(report.aa.noiseMs, report.timerResolutionMs);

  if (limit === null) incomplete.push('Hz bilinmiyor: UI CPU kabul eşiği hesaplanamaz');
  // 0.05F eşiği UI CPU (uiJs) hükmünün paydasıdır: gürültü yalnız uiJs ölçüldüyse
  // yetersizlik üretir. Girdi gecikmesi sınırı (100ms) milisaniye gürültüsünden
  // çok büyüktür ve bu eşiğe bağlı değildir.
  if (report.scopes.uiJs.status === 'measured') {
    if (noise === null) insufficient.push('A/A gürültü ölçülmedi');
    else if (limit !== null && noise >= limit)
      insufficient.push(
        `etkin gürültü ${noise.toFixed(3)}ms (A/A ya da zamanlayıcı çözünürlüğü) ≥ ${limit.toFixed(3)}ms (0.05F): ölçüm yetersiz`,
      );
  }

  for (const name of SCOPE_NAMES) {
    const scope = report.scopes[name];
    if (scope.status !== 'measured') {
      incomplete.push(`${name}: ${scope.status} (${scope.reason})`);
      continue;
    }
    const d = scope.distribution!;
    // Gürültü payı yetersizse uiJs hakkında hüküm verilmez: gürültülü ölçüm ne
    // geçirir ne düşürür (girdi sınırı 100ms gürültüden çok büyüktür, bağımsızdır).
    if (name === 'uiJs' && limit !== null && noise !== null && insufficient.length === 0) {
      if (d.ci95Upper + noise >= limit)
        failures.push(
          `uiJs: p95 üst sınır ${d.ci95Upper.toFixed(3)}ms + gürültü ${noise.toFixed(3)}ms ≥ ${limit.toFixed(3)}ms`,
        );
    }
    if (INPUT_SCOPES.includes(name) && d.p95 >= INPUT_P95_LIMIT_MS)
      failures.push(`${name}: p95 ${d.p95.toFixed(1)}ms ≥ ${INPUT_P95_LIMIT_MS}ms`);
    if (scope.basis !== 'presented')
      incomplete.push(`${name}: dayanak "${scope.basis}", ekrana sunulan kare değil`);
  }

  if (failures.length) return { verdict: 'fail', reasons: failures };
  if (insufficient.length) return { verdict: 'insufficient', reasons: insufficient };
  if (incomplete.length) return { verdict: 'incomplete', reasons: incomplete };
  return { verdict: 'pass', reasons: [] };
}

/** Ardışık `performance.now` okumalarının en küçük pozitif farkı (ms). */
export function timerResolution(readings: readonly number[]): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < readings.length; index += 1) {
    const delta = readings[index] - readings[index - 1];
    if (delta > 0 && delta < smallest) smallest = delta;
  }
  if (!Number.isFinite(smallest)) throw new Error('zamanlayıcı çözünürlüğü ölçülemedi');
  return smallest;
}

/** Başlıca tarayıcı hızlarından birine yakınsa Hz (rAF aralığı medyanından), değilse null. */
export function estimateHz(frameIntervalsMs: readonly number[]): number | null {
  if (frameIntervalsMs.length === 0) return null;
  const median = percentile(
    [...frameIntervalsMs].sort((a, b) => a - b),
    0.5,
  );
  if (!(median > 0)) return null;
  const hz = 1000 / median;
  const nominal = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240].find(
    (candidate) => Math.abs(candidate - hz) / candidate <= 0.04,
  );
  return nominal ?? null;
}

export const REPORT_DIR = resolve(import.meta.dirname, '../../../records/ui-perf');

/** Git dışı kayıt alanına yazar (cihaz adresi/seri/kullanıcı adı rapora girmez). */
export function writeReport(name: string, document: unknown): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const path = resolve(REPORT_DIR, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

export const unmeasured = (status: 'unsupported' | 'not-run', reason: string): Scope => ({
  status,
  reason,
});

/** A/A gürültü: aynı koşulun iki bloğunun p95 farkı (ms). */
export function aaNoise(a: readonly number[], b: readonly number[]): number {
  return Math.abs(distribution(a).p95 - distribution(b).p95);
}

/**
 * Hiçbir ölçü yokken bile dürüst başlangıç: başsız tarayıcıda ölçülemeyen
 * kapsamlar gerekçeyle işaretlidir ve bir spec yalnız gerçekten ölçtüğünü
 * ezer.
 */
export function baselineScopes(): Record<ScopeName, Scope> {
  return {
    uiJs: unmeasured(
      'not-run',
      'kare başına UI JS ölçümü oyun içi yükü ve UI-00.6 browser probunu bekler; vitrin etkileşimi kare maliyeti değildir',
    ),
    styleLayoutPaint: unmeasured(
      'unsupported',
      'başsız tarayıcıda aynı kareye atfedilen stil/yerleşim/çizim izi yok (UI-00.6)',
    ),
    gpu: unmeasured(
      'unsupported',
      'GPU/birleştirici zamanlayıcısı başsız tarayıcıda yok; yüzde uydurulmaz',
    ),
    presentation: unmeasured(
      'unsupported',
      'ekrana sunulan kare başsız tarayıcıda gözlenemez; gerçek cihaz kabulü gerekir',
    ),
    inputPointer: unmeasured('not-run', 'işaretçi gecikmesi ölçülmedi'),
    inputKeyboard: unmeasured('not-run', 'klavye gecikmesi ölçülmedi'),
    inputGamepad: unmeasured(
      'not-run',
      'kol yoklama sondası UI-00.6; sürekli sürükleme için ekran kaydı gerekir',
    ),
    inputAssistive: unmeasured('not-run', 'yardımcı teknoloji girdisi insan kabulüdür (UI-13.4)'),
  };
}
