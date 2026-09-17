import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { serializeSubstrateCandidate, type SubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../morphology/clusterTracker';
import { defaultMetricsConfig } from '../morphology/metrics';
import { defaultPerturbationConfig } from '../morphology/perturbation';
import { defaultPhaseConfig } from '../morphology/phaseClassifier';
import { CheckpointStore } from '../morphology/checkpoint';
import {
  buildCollapseReport,
  defaultCollapseConfig,
  detectSeedCollapse,
} from '../morphology/collapseDetector';
import {
  evaluateLongHorizon,
  resolveFeasibleMinutes,
  runLongHorizonUnit,
  type LongHorizonUnitOutput,
} from '../morphology/longHorizon';
import { measureCalibration } from '../morphology/calibration';
import { buildFromRecords, parseCandidateRecords } from '../morphology/auditionCommand';
import { readSeedCorpus } from '../morphology/seedCorpus';
import { createGitProvider, readSourceState } from '../morphology/sourceState';
import { runUnits } from '../morphology/workerPool';
import type { SeedUnitInput } from '../morphology/seedRunner';

/*
 * F7 — çoklu-seed uzun ufuk ve perturbation. Koşu K15 otomatik kısa listesiyle
 * yapılır (en fazla 8 aday), korpus `corpus-v1`dir ve intrinsic ile void-stress
 * senaryoları BİRLİKTE koşar. Worker ve checkpoint zorunludur; yarıda kesilen
 * koşu kaldığı yerden devam eder.
 */
const REQUESTED_MINUTES = Number(process.argv[2] ?? 30);
const MINIMUM_MINUTES = 10;
/* Koşu bütçesi: §8.4 "uygulanabilir en uzun süre" kararı buna göre ölçülür. */
const BUDGET_HOURS = Number(process.env.VOL_LIFE_F7_BUDGET_HOURS ?? 5);
const WORKERS = Number(process.argv[3] ?? 8);
const RECORDS = process.argv[4] ?? 'benchmarks/results/f3-candidates.jsonl';
const CORPUS = 'benchmarks/fixtures/corpus-v1.json';
const HZ = 60;
const SAMPLE_TICKS = 300;
const PERTURBATION_MINUTES = [5, 15, 25];

const corpus = readSeedCorpus(CORPUS);
const source = readSourceState(createGitProvider(process.cwd()));
const build = buildFromRecords(parseCandidateRecords(readFileSync(RECORDS, 'utf8')), {
  corpusId: corpus.id,
  seeds: corpus.seeds.slice(0, 3),
  sourceRevision: source.revision,
  sourceDirty: source.dirty,
});

/*
 * Süre ÖLÇÜLEREK seçilir. 30 simüle dakika kalibrasyona göre bütçeye sığmazsa
 * §8.4 gereği 10–30 dakika aralığında uygulanabilir en uzun süreye inilir ve
 * gerekçe raporlanır; eşik gevşetilmez, koşu sessizce kısalmaz.
 */
const calibration = measureCalibration(substrateConfig);
const unitCount = build.catalog.entries.length * 2 * corpus.seeds.length;
const feasibility = resolveFeasibleMinutes({
  unitCount,
  msPerTick: calibration.msPerTick,
  workerCount: WORKERS,
  simulationHz: HZ,
  budgetMs: BUDGET_HOURS * 3600 * 1000,
  requestedMinutes: REQUESTED_MINUTES,
  minimumMinutes: MINIMUM_MINUTES,
});
const MINUTES = feasibility.minutes;
console.log(
  `F7 fizibilite: ${unitCount} birim, ölçülen ${calibration.msPerTick.toFixed(4)} ms/tick, ` +
    `${WORKERS} worker → istenen ${REQUESTED_MINUTES} dk ≈ ` +
    `${(feasibility.requestedEstimatedMs / 3600000).toFixed(1)} sa, bütçe ${BUDGET_HOURS} sa. ` +
    `Koşulacak süre ${MINUTES} dk ≈ ${(feasibility.estimatedMs / 3600000).toFixed(1)} sa` +
    (feasibility.shortened ? ' (KISALTILDI, §8.4)' : '') +
    (feasibility.infeasible ? ' — en kısa süre bile bütçeye SIĞMIYOR' : ''),
);

const totalTicks = MINUTES * 60 * HZ;
/* Perturbation ANLARI ön-kayıtlıdır; koşu kısaldıysa sığmayanlar atılır ve raporlanır. */
const appliedMinutes = PERTURBATION_MINUTES.filter((minute) => minute * 60 * HZ < totalTicks);
const specs = appliedMinutes.map((minute, index) => ({
  kind: (['velocity-kick', 'matter-removal', 'position-shift'] as const)[index % 3],
  magnitude: index === 1 ? 0.1 : 1,
  targetFraction: 0.2,
  tick: minute * 60 * HZ,
}));

function unitInput(candidate: SubstrateCandidate, seed: number): SeedUnitInput {
  return {
    substrate: substrateConfig,
    candidateText: serializeSubstrateCandidate(candidate),
    seed,
    tickCount: totalTicks,
    sampleInterval: SAMPLE_TICKS,
    metrics: { ...defaultMetricsConfig, sampleIntervalTicks: SAMPLE_TICKS },
    cluster: {
      ...defaultClusterConfig,
      sampleIntervalTicks: SAMPLE_TICKS,
      maxGapTicks: SAMPLE_TICKS * 2,
      minContinuityTicks: SAMPLE_TICKS * 2,
    },
    phase: { ...defaultPhaseConfig, sampleIntervalTicks: SAMPLE_TICKS },
    perturbation: defaultPerturbationConfig,
    perturbationSpecs: specs,
  };
}

function scenarioVariants(candidate: SubstrateCandidate): SubstrateCandidate[] {
  return [
    { ...candidate, scenario: { kind: 'intrinsic' } },
    { ...candidate, scenario: { kind: 'void-stress', tidalControl: false } },
  ];
}

const configDigest = `${source.revision}:${MINUTES}:${SAMPLE_TICKS}:${specs.length}`;
const store = new CheckpointStore<LongHorizonUnitOutput>(
  'benchmarks/results/f7-checkpoint.jsonl',
  configDigest,
);

const started = Date.now();
const perCandidate: Record<string, LongHorizonUnitOutput[]> = {};
let completed = 0;
const totalUnits = unitCount;

for (const entry of build.catalog.entries) {
  const base = JSON.parse(entry.genome) as SubstrateCandidate;
  for (const variant of scenarioVariants(base)) {
    const scenario = variant.scenario.kind;
    const units = corpus.seeds
      .map((seed) => ({
        workId: `f7:${entry.digest}:${scenario}:${String(seed).padStart(10, '0')}`,
        input: unitInput(variant, seed),
      }))
      .filter((unit) => !store.has(unit.workId));

    const cached = corpus.seeds
      .map((seed) => store.get(`f7:${entry.digest}:${scenario}:${String(seed).padStart(10, '0')}`))
      .filter((value): value is LongHorizonUnitOutput => value !== undefined);

    const fresh = await runUnits(units, WORKERS, 'longHorizonWorker.mjs', runLongHorizonUnit);
    for (const result of fresh) store.record(result.workId, result.output);

    const outputs = [...cached, ...fresh.map((result) => result.output)];
    perCandidate[`${entry.digest}:${scenario}`] = outputs;
    completed += outputs.length;
    console.log(
      `${entry.digest} ${scenario}: ${outputs.length} seed bitti ` +
        `(${completed}/${totalUnits}, ${((Date.now() - started) / 60000).toFixed(1)} dk)`,
    );
  }
}

const results = Object.entries(perCandidate).map(([key, outputs]) => {
  const [digest, scenario] = key.split(':');
  const verdict = evaluateLongHorizon(outputs);
  const collapseConfig = { ...defaultCollapseConfig, sampleIntervalTicks: SAMPLE_TICKS };
  const collapse = buildCollapseReport(
    outputs.map((output) => detectSeedCollapse(output.seed, output.curve, collapseConfig)),
    collapseConfig,
  );
  return { digest, scenario, verdict, collapse };
});

const summary = {
  madde: 'F7',
  tarih: new Date().toISOString().slice(0, 10),
  revision: source.revision,
  temizKaynak: !source.dirty,
  korpus: corpus.id,
  seedSayısı: corpus.seeds.length,
  dakika: MINUTES,
  istenenDakika: REQUESTED_MINUTES,
  kısaltıldı: feasibility.shortened,
  ölçülenMsPerTick: +calibration.msPerTick.toFixed(4),
  tahminSaat: +(feasibility.estimatedMs / 3600000).toFixed(2),
  örnekAralığıTick: SAMPLE_TICKS,
  perturbationDakikaları: appliedMinutes,
  adaySayısı: build.catalog.entries.length,
  süreDk: +((Date.now() - started) / 60000).toFixed(1),
  sonuçlar: results,
};

mkdirSync('benchmarks/results', { recursive: true });
writeFileSync('benchmarks/results/f7-long-horizon.json', JSON.stringify(summary, null, 2), 'utf8');
for (const result of results) {
  const verdict = result.verdict;
  console.log(
    `${result.digest} ${result.scenario}: ${verdict.passed ? 'GEÇTİ' : 'FAIL'} — ` +
      `koruma medyan ${verdict.retentionMedian.toFixed(3)}, en kötü ${verdict.retentionMin.toFixed(
        3,
      )}, ` +
      `yapısal %${(verdict.structuredShare * 100).toFixed(0)}` +
      (verdict.failures.length > 0 ? ` — ${verdict.failures.join('; ')}` : '') +
      (result.collapse.canaryRequired ? ' — CANARY GEREKLİ' : ''),
  );
}
