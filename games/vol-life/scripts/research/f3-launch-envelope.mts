import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../morphology/clusterTracker';
import { defaultHarnessConfig } from '../morphology/harness';
import { defaultMetricsConfig } from '../morphology/metrics';
import { defaultPerturbationConfig } from '../morphology/perturbation';
import { defaultPhaseConfig } from '../morphology/phaseClassifier';
import { evaluateFamilyFalsification } from '../morphology/falsification';
import { measureStartupSurvival, type StartupSample } from '../morphology/startupSurvival';
import { runSeedUnit, type SeedUnitOutput } from '../morphology/seedRunner';
import { generateSeedCorpus } from '../morphology/shards';
import { runUnits } from '../morphology/workerPool';

/*
 * §8.4 (a): "broad adayların %1'inden azı hem launch envelope'u seed'lerin
 * ≥ %75'inde geçiyor hem DYNAMIC_STRUCTURED oluyor" → aile çürür.
 *
 * Ölçüm F3'ün AYNI koşu yolundan (aynı `runSeedUnit`, aynı aşama ayarları,
 * aynı seed'ler) geçer; ikinci bir simülasyon yolu iki farklı "launch
 * envelope" tanımı üretirdi.
 */
const RECORDS = process.argv[2] ?? 'benchmarks/results/f3-candidates.jsonl';
const WORKERS = Number(process.argv[3] ?? 8);
const BROAD_CANDIDATE_COUNT = Number(process.argv[4] ?? 2048);
const stage = defaultHarnessConfig.broad;
const seeds = generateSeedCorpus(0, stage.seedCount);
const HZ = 60;

/* §8.4 launch envelope, SEED BAŞINA; 30 sn'lik koşuda ölçülen üç satır. */
const RETENTION_10_MIN = 0.95;
const RETENTION_30_MIN = 0.9;
const EARLY_BURST_MAX = 0.1;
const SEED_SHARE_REQUIRED = 0.75;

interface CandidateRecord {
  readonly index: number;
  readonly genome: string;
  readonly structured: boolean;
}

const records = readFileSync(RECORDS, 'utf8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as CandidateRecord)
  .filter((record) => record.structured);

const units = records.flatMap((record) =>
  seeds.map((seed) => ({
    workId: `launch:${String(record.index).padStart(5, '0')}:${seed}`,
    input: {
      substrate: substrateConfig,
      candidateText: record.genome,
      seed,
      tickCount: stage.tickCount + stage.sampleInterval,
      sampleInterval: stage.sampleInterval,
      metrics: { ...defaultMetricsConfig, sampleIntervalTicks: stage.sampleInterval },
      cluster: {
        ...defaultClusterConfig,
        sampleIntervalTicks: stage.sampleInterval,
        maxGapTicks: stage.sampleInterval * 2,
        minContinuityTicks: stage.sampleInterval * 2,
      },
      phase: { ...defaultPhaseConfig, sampleIntervalTicks: stage.sampleInterval },
      perturbation: defaultPerturbationConfig,
      perturbationSpecs: [],
    },
  })),
);

/** Broad örneklerinden launch envelope serisi; alan adları birebir eşleşir. */
function toStartupSamples(output: SeedUnitOutput): StartupSample[] {
  return output.samples.map((sample) => ({
    seconds: sample.tick / HZ,
    activeCount: sample.activeCount,
    meanSpeed: sample.meanSpeed,
    cappedFraction: sample.cappedFraction,
    voidLossTotal: sample.voidLossCount,
  }));
}

const started = Date.now();
const results = await runUnits(units, WORKERS, 'seedWorker.mjs', runSeedUnit);

const perCandidate = new Map<number, { passed: number; total: number; retention10: number[] }>();
for (const result of results) {
  const index = Number(result.workId.split(':')[1]);
  const samples = toStartupSamples(result.output);
  const initialCount = samples[0]?.activeCount ?? 0;
  const metrics = measureStartupSurvival(
    { seed: result.output.seed, initialCount, samples },
    {
      retention10MedianMin: RETENTION_10_MIN,
      retention10WorstDecileMin: 0.9,
      retention30MedianMin: RETENTION_30_MIN,
      earlyBurstMaxCappedFraction: EARLY_BURST_MAX,
      earlyWindowSeconds: 10,
      settlingSeconds: stage.tickCount / HZ,
      settlingSeedFractionMin: 0.9,
      seedFailureFractionForReject: 0.5,
      transientWindowStartSeconds: 20,
      transientWindowEndSeconds: stage.tickCount / HZ,
      transientBandMultiple: 1.2,
    },
  );
  const passed =
    metrics.matterRetention10 >= RETENTION_10_MIN &&
    metrics.matterRetention30 >= RETENTION_30_MIN &&
    metrics.earlyBurstPeak <= EARLY_BURST_MAX;
  const entry = perCandidate.get(index) ?? { passed: 0, total: 0, retention10: [] };
  entry.total += 1;
  if (passed) entry.passed += 1;
  entry.retention10.push(metrics.matterRetention10);
  perCandidate.set(index, entry);
}

const passing = [...perCandidate.entries()].filter(
  ([, entry]) => entry.passed / entry.total >= SEED_SHARE_REQUIRED,
);

const verdict = evaluateFamilyFalsification({
  family: 'generalized-asymmetric-multi-band',
  broadCandidateCount: BROAD_CANDIDATE_COUNT,
  passingCandidateCount: passing.length,
  // Refinement bu koşuda ayrı bir aşama olarak koşulmadı; ölçülmemiş sayılır.
  refinementSurvivorCount: null,
  humanRejectedAll: null,
});

const summary = {
  madde: 'F3-launch-envelope',
  tarih: new Date().toISOString().slice(0, 10),
  yapısalAday: records.length,
  broadAday: BROAD_CANDIDATE_COUNT,
  seedSayısı: seeds.length,
  saniye: stage.tickCount / HZ,
  süreDk: +((Date.now() - started) / 60000).toFixed(1),
  envelopeGeçenAday: passing.length,
  envelopeGeçenOran: +(passing.length / BROAD_CANDIDATE_COUNT).toFixed(5),
  çürütme: verdict,
  enİyiOn: passing
    .map(([index, entry]) => ({
      index,
      geçenSeedPayı: +(entry.passed / entry.total).toFixed(2),
      medyanKoruma10: +entry.retention10
        .sort((a, b) => a - b)
        [Math.floor(entry.retention10.length / 2)].toFixed(4),
    }))
    .sort((a, b) => b.medyanKoruma10 - a.medyanKoruma10)
    .slice(0, 10),
};

mkdirSync('benchmarks/results', { recursive: true });
writeFileSync(
  'benchmarks/results/f3-launch-envelope.json',
  JSON.stringify(summary, null, 2),
  'utf8',
);
console.log(
  `Launch envelope: ${records.length} yapısal aday × ${seeds.length} seed — ` +
    `≥%75 seed'de geçen ${passing.length} aday (broad'un %${(
      (passing.length / BROAD_CANDIDATE_COUNT) *
      100
    ).toFixed(2)}'si), süre ${summary.süreDk} dk`,
);
console.log(
  `Çürütme: ${verdict.falsified ? 'AİLE ÇÜRÜDÜ' : 'aile çürümedi'} — ` +
    `${verdict.reasons.join('; ') || 'gerekçe yok'}` +
    (verdict.unmeasured.length > 0 ? ` | ölçülmemiş: ${verdict.unmeasured.join(', ')}` : ''),
);
