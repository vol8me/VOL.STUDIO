import {
  createCoreSimulationWorkloads,
  runBenchmarkSuite,
  type BenchmarkSuiteResult,
} from '../src/benchmark/index';

const USAGE = [
  'Kullanım:',
  '  pnpm --filter @volstudio/core benchmark [--iterations N] [--warmup N] [--samples N]',
  '    [--entities N] [--grid-size N] [--json]',
].join('\n');

interface Flags {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: number;
  readonly entities: number;
  readonly gridSize: number;
  readonly json: boolean;
}

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseFlags(args: readonly string[]): Flags {
  let iterations = 1_000;
  let warmupIterations = 100;
  // bkz. core/src/benchmark/harness.ts DEFAULT_SAMPLES: nearest-rank p95
  // formülü N < 20'de her zaman maksimumu seçer, "p95" adını taşıyıp onu
  // ÖLÇMEZDİ. CLI kendi varsayılanını taşıdığı için harness'teki değer
  // tek başına yeterli değildi — ikisi birlikte güncellenir.
  let samples = 25;
  let entities = 256;
  let gridSize = 48;
  let json = false;

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--json') {
      json = true;
      continue;
    }
    const raw = args[++index];
    if (raw === undefined) fail(`${flag} bir değer bekliyor`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0)
      fail(`${flag} güvenli, negatif olmayan tam sayı olmalı`);

    switch (flag) {
      case '--iterations':
        if (value < 1) fail('--iterations en az 1 olmalı');
        iterations = value;
        break;
      case '--warmup':
        warmupIterations = value;
        break;
      case '--samples':
        if (value < 1) fail('--samples en az 1 olmalı');
        samples = value;
        break;
      case '--entities':
        if (value < 1) fail('--entities en az 1 olmalı');
        entities = value;
        break;
      case '--grid-size':
        if (value < 1) fail('--grid-size en az 1 olmalı');
        gridSize = value;
        break;
      default:
        fail(`Bilinmeyen bayrak: ${flag}`);
    }
  }

  return { iterations, warmupIterations, samples, entities, gridSize, json };
}

function printText(result: BenchmarkSuiteResult): void {
  console.log(
    `CORE benchmark | ${result.iterations} iterasyon × ${result.samples} örnek | ` +
      `ısınma ${result.warmupIterations}`,
  );
  for (const workload of result.workloads) {
    console.log(
      `  ${workload.name} | medyan ${workload.medianMsPerIteration.toFixed(4)} ms/iter | ` +
        `p95 ${workload.p95MsPerIteration.toFixed(4)} ms/iter | ` +
        `${workload.operationsPerSecond.toFixed(1)} op/s`,
    );
  }
}

const flags = parseFlags(process.argv.slice(2));
const result = runBenchmarkSuite(
  createCoreSimulationWorkloads({ entityCount: flags.entities, gridSize: flags.gridSize }),
  {
    iterations: flags.iterations,
    warmupIterations: flags.warmupIterations,
    samples: flags.samples,
  },
);

if (flags.json) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        package: '@volstudio/core',
        runtime: process.version,
        platform: process.platform,
        options: {
          iterations: flags.iterations,
          warmupIterations: flags.warmupIterations,
          samples: flags.samples,
          entities: flags.entities,
          gridSize: flags.gridSize,
        },
        ...result,
      },
      null,
      2,
    ),
  );
} else {
  printText(result);
}
