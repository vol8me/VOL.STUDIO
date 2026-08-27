import { runBenchmarkSuite, type BenchmarkSuiteResult } from '@volstudio/core/benchmark';
import { simulationConfig } from '../src/config/simulation';
import { VolHellSimulation } from '../src/runtime/simulation/VolHellSimulation';

const USAGE = [
  'Kullanım:',
  '  pnpm --filter @volstudio/vol-hell benchmark:simulation',
  '    [--iterations N] [--warmup N] [--samples N] [--step-ms N] [--json]',
].join('\n');

interface Flags {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: number;
  readonly stepMs: number;
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
  let samples = 3;
  let stepMs: number = simulationConfig.defaultStepMs;
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
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`${flag} güvenli, negatif olmayan tam sayı olmalı`);
    }

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
      case '--step-ms':
        if (value < 1) fail('--step-ms en az 1 olmalı');
        stepMs = value;
        break;
      default:
        fail(`Bilinmeyen bayrak: ${flag}`);
    }
  }

  return { iterations, warmupIterations, samples, stepMs, json };
}

function createSimulationWorkloads(stepMs: number) {
  return [
    {
      name: 'vol-hell/simulation-step',
      create: () => {
        const simulation = new VolHellSimulation({
          seed: simulationConfig.defaultSeed,
          killRadius: simulationConfig.defaultKillRadius,
          stepMs,
        });
        let checksum = 0;
        let frame = 0;
        return {
          step(): void {
            simulation.step(stepMs);
            frame += 1;
            if (frame % 32 === 0) {
              const state = simulation.snapshot();
              checksum += state.enemyCount + state.economy.spark + state.economy.flux;
            }
          },
          dispose(): void {
            if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
          },
        };
      },
    },
    {
      name: 'vol-hell/simulation-render-snapshot',
      create: () => {
        const simulation = new VolHellSimulation({
          seed: simulationConfig.defaultSeed,
          killRadius: simulationConfig.defaultKillRadius,
          stepMs,
        });
        let checksum = 0;
        return {
          step(): void {
            simulation.step(stepMs);
            const frame = simulation.getRenderSnapshot();
            checksum += frame.enemies.length + frame.pickups.length + frame.currentWave;
          },
          dispose(): void {
            if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
          },
        };
      },
    },
  ];
}

function printText(result: BenchmarkSuiteResult): void {
  console.log(
    `VOL.HELL simulation benchmark | ${result.iterations} iterasyon × ${result.samples} örnek | ` +
      `ısınma ${result.warmupIterations}`,
  );
  for (const workload of result.workloads) {
    console.log(
      `  ${workload.name} | medyan ${workload.medianMsPerIteration.toFixed(4)} ms/iter | ` +
        `p95 ${workload.p95MsPerIteration.toFixed(4)} ms/iter | ` +
        `${workload.operationsPerSecond.toFixed(1)} frame/s`,
    );
  }
}

const flags = parseFlags(process.argv.slice(2));
const result = runBenchmarkSuite(createSimulationWorkloads(flags.stepMs), {
  iterations: flags.iterations,
  warmupIterations: flags.warmupIterations,
  samples: flags.samples,
});

if (flags.json) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        package: '@volstudio/vol-hell',
        workload: 'simulation',
        runtime: process.version,
        platform: process.platform,
        options: {
          iterations: flags.iterations,
          warmupIterations: flags.warmupIterations,
          samples: flags.samples,
          stepMs: flags.stepMs,
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
