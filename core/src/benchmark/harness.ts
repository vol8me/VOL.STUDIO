/**
 * Ortamdan bağımsız, deterministik benchmark koşucusu.
 *
 * Harness yalnızca `create → warmup → ölç → dispose` yaşam döngüsünü bilir;
 * ölçülen sistemin ne olduğu CORE'a ait bir varsayım değildir. Böylece aynı
 * kapı oyun simülasyonu, uzamsal indeks veya başka bir headless workload için
 * kullanılabilir.
 */

export interface BenchmarkScenario {
  step(): void;
  dispose?(): void;
}

export interface BenchmarkWorkload {
  readonly name: string;
  create(): BenchmarkScenario;
}

export interface BenchmarkOptions {
  /** Her örnekte ölçülen adım sayısı. Varsayılan 1.000. */
  readonly iterations?: number;
  /** JIT/ilk tahsis maliyetini ayıran ölçülmeyen adım sayısı. */
  readonly warmupIterations?: number;
  /** Her workload için bağımsız ölçüm örneği. Varsayılan 3. */
  readonly samples?: number;
  /** Testte saat enjeksiyonu; verilmezse monotonic `performance.now()` kullanılır. */
  readonly now?: () => number;
}

export interface BenchmarkSample {
  readonly sample: number;
  readonly iterations: number;
  readonly elapsedMs: number;
  readonly msPerIteration: number;
  readonly operationsPerSecond: number;
}

export interface BenchmarkResult {
  readonly name: string;
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: readonly BenchmarkSample[];
  readonly medianMsPerIteration: number;
  readonly p95MsPerIteration: number;
  readonly operationsPerSecond: number;
}

export interface BenchmarkSuiteResult {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: number;
  readonly workloads: readonly BenchmarkResult[];
}

const DEFAULT_ITERATIONS = 1_000;
const DEFAULT_WARMUP_ITERATIONS = 100;
const DEFAULT_SAMPLES = 3;

/** Tek workload'ü ölçer. Her örnek taze bir senaryo ile başlar. */
export function runBenchmark(
  workload: BenchmarkWorkload,
  options: BenchmarkOptions = {},
): BenchmarkResult {
  const iterations = positiveInteger(options.iterations ?? DEFAULT_ITERATIONS, 'iterations');
  const warmupIterations = nonNegativeInteger(
    options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS,
    'warmupIterations',
  );
  const samples = positiveInteger(options.samples ?? DEFAULT_SAMPLES, 'samples');
  const now = options.now ?? (() => performance.now());
  const measured: BenchmarkSample[] = [];

  for (let sample = 1; sample <= samples; sample++) {
    const scenario = workload.create();
    try {
      for (let index = 0; index < warmupIterations; index++) scenario.step();

      const start = now();
      for (let index = 0; index < iterations; index++) scenario.step();
      const elapsedMs = Math.max(0, now() - start);
      const msPerIteration = elapsedMs / iterations;
      measured.push({
        sample,
        iterations,
        elapsedMs,
        msPerIteration,
        operationsPerSecond: elapsedMs > 0 ? (iterations * 1_000) / elapsedMs : 0,
      });
    } finally {
      scenario.dispose?.();
    }
  }

  const perIteration = measured.map((sample) => sample.msPerIteration).sort((a, b) => a - b);
  const medianMsPerIteration = percentile(perIteration, 0.5);
  const p95MsPerIteration = percentile(perIteration, 0.95);

  return {
    name: workload.name,
    iterations,
    warmupIterations,
    samples: measured,
    medianMsPerIteration,
    p95MsPerIteration,
    operationsPerSecond: medianMsPerIteration > 0 ? 1_000 / medianMsPerIteration : 0,
  };
}

/** Workload'leri sırayla ölçer; bir workload'un durumu diğerine sızmaz. */
export function runBenchmarkSuite(
  workloads: readonly BenchmarkWorkload[],
  options: BenchmarkOptions = {},
): BenchmarkSuiteResult {
  const iterations = positiveInteger(options.iterations ?? DEFAULT_ITERATIONS, 'iterations');
  const warmupIterations = nonNegativeInteger(
    options.warmupIterations ?? DEFAULT_WARMUP_ITERATIONS,
    'warmupIterations',
  );
  const samples = positiveInteger(options.samples ?? DEFAULT_SAMPLES, 'samples');
  const benchmarkOptions = { ...options, iterations, warmupIterations, samples };

  return {
    iterations,
    warmupIterations,
    samples,
    workloads: workloads.map((workload) => runBenchmark(workload, benchmarkOptions)),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Benchmark ${name} pozitif güvenli bir tam sayı olmalı`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Benchmark ${name} negatif olmayan güvenli bir tam sayı olmalı`);
  }
  return value;
}
