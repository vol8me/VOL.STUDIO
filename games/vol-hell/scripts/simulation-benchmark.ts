import { runBenchmarkSuite, type BenchmarkSuiteResult } from '@volstudio/core/benchmark';
import { simulationConfig } from '../src/config/simulation';
import { difficultyConfig } from '../src/config/difficulty';
import { WAVE_RUN_DURATION_MS } from '../src/config/wave';
import { getDifficultyState } from '../src/runtime/systems/DifficultyCalculator';
import { VolHellSimulation } from '../src/runtime/simulation/VolHellSimulation';

const USAGE = [
  'Kullanım:',
  '  pnpm --filter @volstudio/vol-hell benchmark:simulation',
  '    [--iterations N] [--warmup N] [--samples N] [--step-ms N] [--json] [--skip-allocation]',
  '',
  'Ayırma (allocation) ölçümü `global.gc()` gerektirir; onsuz GC baskısı dahil',
  'gürültülü bir tahmine düşer. Temiz ölçüm için:',
  '  NODE_OPTIONS=--expose-gc pnpm --filter @volstudio/vol-hell benchmark:simulation',
].join('\n');

interface Flags {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: number;
  readonly stepMs: number;
  readonly json: boolean;
  readonly skipAllocation: boolean;
}

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseFlags(args: readonly string[]): Flags {
  let iterations = 1_000;
  let warmupIterations = 100;
  // bkz. core/src/benchmark/harness.ts DEFAULT_SAMPLES — nearest-rank p95
  // formülü N < 20'de her zaman maksimumu seçer; CLI kendi varsayılanını
  // taşıdığı için harness'teki değerle birlikte güncellenir.
  let samples = 25;
  let stepMs: number = simulationConfig.defaultStepMs;
  let json = false;
  let skipAllocation = false;

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--json') {
      json = true;
      continue;
    }
    if (flag === '--skip-allocation') {
      skipAllocation = true;
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

  return { iterations, warmupIterations, samples, stepMs, json, skipAllocation };
}

/**
 * Isıtma fazının kendi adım boyu — ÖLÇÜM `stepMs`sinden BİLEREK ayrıdır.
 *
 * `harness.runBenchmark` her ÖRNEK için `workload.create()`i yeniden çağırır
 * (bkz. core/src/benchmark/harness.ts) — yani ısıtma `samples` kez tekrarlanır.
 * ~14 dakikalık simüle süreyi 16 ms'lik ince adımlarla katetmek örnek başına
 * ~53.500 adım (`samples: 25`de toplam >1,3 milyon) demekti ve ilk denemede
 * benchmark'ı dakikalarca kilitledi. Doğum sayacı tek bir `if` iledir (bkz.
 * `step()` — `while` değil), yani kaba bir adım da en fazla BİR doğum
 * tetikler; tavana ulaşmak için gereken ~56 ek düşman, 1000 ms'lik adımlarla
 * bile mevcut adım bütçesinin (~850+) küçük bir kısmını tüketir. Zorluk
 * TAVANININ kendisi yalnız `elapsedMs`e bağlıdır, adım boyundan bağımsızdır.
 */
const RAMP_STEP_MS = 1000;

/**
 * Popülasyonu ısıtan, ölçülmeyen TOPLAM süre (ms) — adım SAYISI değil. Adım
 * sayısına çevirmek çağıranın işi (`RAMP_STEP_MS`e böler).
 *
 * **Hedef `difficultyConfig.maxEnemiesCap` (80) DEĞİL, bir koşunun
 * ULAŞABİLECEĞİ gerçek tavan.** İlk denemede tavana analitik olarak çözülen
 * süre (~14,25 dk) `WAVE_RUN_DURATION_MS`i (20 dalga × 40 sn = 13,3 dk)
 * AŞTI — yani 80'e gerçek bir koşunun ömrü içinde hiçbir zaman ulaşılamaz;
 * `maxEnemiesCap` çalışma zamanı sınırlaması içindir ("performans koruması"),
 * ulaşılması beklenen bir hedef değildir. `step()` `runCompleted` sonrası
 * no-op'a düşer (bkz. VolHellSimulation.step) — ısıtma bunu aşarsa ÖLÇÜLEN
 * kısım koşu bitmiş bir simülasyonda hiçbir şey yapmadan ~0 ms raporlardı;
 * ilk sürümde tam olarak bu oldu. Bu yüzden hedef koşunun SONUNDA doğal
 * olarak ulaşılan popülasyona çekildi (`WAVE_RUN_DURATION_MS` anındaki
 * `maxEnemies` — gerçek bir oyuncunun görebileceği en yoğun an) ve küçük bir
 * pay (`SATURATION_SAFETY_MARGIN_MS`) bırakılarak koşunun TAM sınırına
 * yapışılması önlendi.
 *
 * `getDifficultyState` formülünden ANALİTİK olarak çözülür — config
 * değişirse (`maxEnemiesGrowthPerMinute`, `rampMinutes` vb.) bu da otomatik
 * doğru kalır. `killRadius: null` ile birlikte kullanılmalı: aksi hâlde
 * varsayılan `killRadius` yaklaşan her düşmanı anında öldürür ve popülasyon
 * hiçbir zaman tavana yaklaşmaz (bkz. bu dosyanın en alt yorumu).
 */
function computeSaturationRampMs(): number {
  const targetMs = Math.min(
    computeMsToReachExtraEnemies(difficultyConfig.maxEnemiesCap - enemyBaselineCount()),
    WAVE_RUN_DURATION_MS - SATURATION_SAFETY_MARGIN_MS,
  );
  return Math.max(0, targetMs);
}

/** Koşunun kendi sonuna yapışıp `runCompleted` no-op'una düşmemek için pay. */
const SATURATION_SAFETY_MARGIN_MS = 5_000;

/**
 * `extraEnemiesNeeded` kadar ek düşman kapasitesine ulaşmak için gereken
 * `elapsedMs`. `getDifficultyState`in `extraEnemies` formülünün analitik
 * tersi: `minutes <= rampMinutes` için `rampedFactor = minutes ×
 * rampSlowdownFactor` (yavaş faz); ötesinde `rampedFactor` sabitlenir ve
 * `beyondRamp = minutes - rampMinutes` tam hızda eklenir.
 */
function computeMsToReachExtraEnemies(extraEnemiesNeeded: number): number {
  if (extraEnemiesNeeded <= 0) return 0;
  const { maxEnemiesGrowthPerMinute, rampMinutes, rampSlowdownFactor } = difficultyConfig;

  const extraAtRampEnd = rampMinutes * rampSlowdownFactor * maxEnemiesGrowthPerMinute;
  if (extraEnemiesNeeded <= extraAtRampEnd) {
    const neededRampedFactor = extraEnemiesNeeded / maxEnemiesGrowthPerMinute;
    const minutes = neededRampedFactor / rampSlowdownFactor;
    return Math.ceil(minutes * 60_000);
  }

  const remaining = extraEnemiesNeeded - extraAtRampEnd;
  const beyondRampMinutes = remaining / maxEnemiesGrowthPerMinute;
  const totalMinutes = rampMinutes + beyondRampMinutes;
  return Math.ceil(totalMinutes * 60_000);
}

/** `getDifficultyState(0)`in taban `maxEnemies`i — düşman kataloğu sınırı. */
function enemyBaselineCount(): number {
  return getDifficultyState(0).maxEnemies;
}

/** Popülasyonu tavana kadar ısıtır — kaba `RAMP_STEP_MS` ile, ölçülmez. */
function rampToSaturation(simulation: VolHellSimulation): void {
  const steps = Math.ceil(computeSaturationRampMs() / RAMP_STEP_MS);
  for (let index = 0; index < steps; index++) simulation.step(RAMP_STEP_MS);
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
      // `killRadius: 140` (varsayılan) oyuncuya 140 px'e giren HER düşmanı o
      // karede öldürür — sürekli budama popülasyonu gerçek performans
      // tavanının (`maxEnemiesCap: 80`) çok altında tutar. Yukarıdaki
      // 'simulation-step' bu yüzden yalnızca HAFİF/erken-oyun yükünü ölçer;
      // spatial index/behavior update maliyetinin düşman sayısıyla nasıl
      // ölçeklendiğini görmek için popülasyonun gerçekten TAVANA dayandığı
      // bir senaryo gerekir. `killRadius: null` öldürmeyi tamamen kapatır;
      // ısıtma fazı (ölçülmez) popülasyonu tavana taşır, ölçüm o platoda
      // sürer (spawn zaten `maxEnemies`e ulaşınca kendiliğinden durur).
      name: 'vol-hell/simulation-step-saturated',
      create: () => {
        const simulation = new VolHellSimulation({
          seed: simulationConfig.defaultSeed,
          killRadius: null,
          stepMs,
        });
        rampToSaturation(simulation);

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
    {
      // Aynı gerekçe: render snapshot maliyeti de saturasyonda ölçülmeli,
      // çünkü `createRenderSnapshot` düşman/pickup sayısıyla orantılı yeni
      // dizi+nesne ayırır (bkz. runtime/simulation/snapshots.ts). Hafif
      // yükte ölçülen maliyet, 80 düşmanlık gerçek geç-oyun karesini temsil
      // etmez.
      name: 'vol-hell/simulation-render-snapshot-saturated',
      create: () => {
        const simulation = new VolHellSimulation({
          seed: simulationConfig.defaultSeed,
          killRadius: null,
          stepMs,
        });
        rampToSaturation(simulation);

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

interface AllocationReport {
  readonly label: string;
  readonly calls: number;
  readonly totalBytes: number;
  readonly bytesPerCall: number;
  readonly enemyCountAtMeasurement: number;
  readonly gcForced: boolean;
}

/**
 * `getRenderSnapshot()`in yığın (heap) ayırma maliyetini doğrudan ölçer.
 *
 * Süre ölçen benchmark harness'i bunu GÖRMEZ: bir kopyalama işlemi hızlı
 * olabilir ama saniyede 60 kez binlerce bayt ayırıyorsa GC baskısı gerçek
 * cihazda fren tutukluğuna (jank) dönüşür. `global.gc()` varsa (Node
 * `--expose-gc` ile başlatılmış) ölçümden önce/sonra zorla toplanır ve
 * fark yalnızca bu N çağrının ayırdığı belleği yansıtır; yoksa aynı ölçüm
 * yine yapılır ama GC'nin araya girme ihtimaliyle gürültülü olduğu açıkça
 * işaretlenir.
 */
function measureRenderSnapshotAllocation(stepMs: number): AllocationReport {
  const forcedGc = (global as { gc?: () => void }).gc;
  const gcForced = typeof forcedGc === 'function';

  const simulation = new VolHellSimulation({
    seed: simulationConfig.defaultSeed,
    killRadius: null,
    stepMs,
  });
  rampToSaturation(simulation);
  const enemyCountAtMeasurement = simulation.snapshot().enemyCount;

  const calls = 200;
  // Isınma: ilk çağrılar V8'in dizi/obje şekil optimizasyonunu (hidden
  // class) henüz kurmamış olabilir; ölçülmeyen bir tur bunu ayırır.
  for (let index = 0; index < 20; index++) simulation.getRenderSnapshot();

  if (gcForced) forcedGc();
  const before = process.memoryUsage().heapUsed;
  const sink: unknown[] = [];
  for (let index = 0; index < calls; index++) {
    simulation.step(stepMs);
    sink.push(simulation.getRenderSnapshot());
  }
  // Ölçümden ÖNCE değil sonra zorla toplama: `before`nin kendisi GC'nin
  // tam ortasında alınırsa negatif/anlamsız bir delta üretebilir. `sink`
  // döngü bitene kadar canlı tutulur ki optimizasyon motoru ayırmaları
  // "kullanılmıyor" diye elemesin.
  const after = process.memoryUsage().heapUsed;
  const totalBytes = Math.max(0, after - before);
  if (sink.length !== calls) throw new Error('Benchmark sink tutarsız');

  return {
    label: gcForced
      ? 'render-snapshot-allocation'
      : 'render-snapshot-allocation (gürültülü — --expose-gc yok)',
    calls,
    totalBytes,
    bytesPerCall: totalBytes / calls,
    enemyCountAtMeasurement,
    gcForced,
  };
}

function printText(result: BenchmarkSuiteResult, allocation: AllocationReport | null): void {
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
  if (allocation) {
    console.log(
      `  ${allocation.label} | ${(allocation.bytesPerCall / 1024).toFixed(2)} KB/çağrı | ` +
        `${allocation.enemyCountAtMeasurement} düşman | ${allocation.calls} çağrı, ` +
        `${(allocation.totalBytes / 1024).toFixed(1)} KB toplam`,
    );
  }
}

const flags = parseFlags(process.argv.slice(2));
const result = runBenchmarkSuite(createSimulationWorkloads(flags.stepMs), {
  iterations: flags.iterations,
  warmupIterations: flags.warmupIterations,
  samples: flags.samples,
});
const allocation = flags.skipAllocation ? null : measureRenderSnapshotAllocation(flags.stepMs);

if (flags.json) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 2,
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
        allocation,
      },
      null,
      2,
    ),
  );
} else {
  printText(result, allocation);
}
