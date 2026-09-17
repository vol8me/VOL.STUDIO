import { mkdirSync, writeFileSync } from 'node:fs';
import {
  cloneSubstrateCandidate,
  serializeSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../morphology/clusterTracker';
import { defaultHarnessConfig } from '../morphology/harness';
import { defaultMetricsConfig } from '../morphology/metrics';
import { defaultPerturbationConfig } from '../morphology/perturbation';
import {
  aggregateSeedVerdicts,
  defaultPhaseConfig,
  type ReasonCode,
} from '../morphology/phaseClassifier';
import { physicsProfileAt } from '../morphology/physicsSampler';
import { initialSpeedFor, seedingProfileAt } from '../morphology/seedingSampler';
import { runSeedUnit, type SeedUnitOutput } from '../morphology/seedRunner';
import { medianOf } from '../morphology/stats';
import type { CatalogMetrics } from '../morphology/auditionCatalog';
import { generateSeedCorpus } from '../morphology/shards';
import { runUnits } from '../morphology/workerPool';

/*
 * F3 — broad aşaması. Aday = FİZİK + SEEDING birlikte; ikisi de uzayı dolduran
 * örneklemeden gelir ve varsayılanın komşuluğuyla sınırlı değildir.
 *
 * Aday sayısı YAKINSAMAYLA kilitlenir: N ve 2N adayda her fazın payı ±2 yüzde
 * puan içinde kalmalıdır. Geçersiz örnek oranı raporlanır.
 */
const CANDIDATE_COUNT = Number(process.argv[2] ?? 2048);
const WORKERS = Number(process.argv[3] ?? 8);
const stage = defaultHarnessConfig.broad;
const seeds = generateSeedCorpus(0, stage.seedCount);

function candidateAt(index: number): SubstrateCandidate {
  const base = cloneSubstrateCandidate(substrateConfig.candidate);
  const physics = physicsProfileAt(index);
  const seeding = seedingProfileAt(index, 1, substrateConfig);
  return {
    ...base,
    physics,
    seeding: {
      ...seeding,
      initialSpeedUnitsPerReferenceTick: initialSpeedFor(
        index,
        physics.dynamics.maxSpeedUnitsPerReferenceTick,
      ),
    },
  };
}

interface CandidateOutcome {
  readonly index: number;
  readonly primary: ReasonCode | null;
  readonly structured: boolean;
  /** Kısa listenin (F5) girdisi; aday başına ölçülen, uydurulmayan özet. */
  readonly record: CandidateRecord;
}

interface CandidateRecord {
  readonly index: number;
  readonly genome: string;
  readonly primary: ReasonCode | null;
  readonly structured: boolean;
  readonly phaseDistribution: Record<string, number>;
  readonly metrics: CatalogMetrics;
}

/** Seed'ler arası ORTANCA alınır: tek bir şanslı seed adayı temsil etmez. */
function summarize(outputs: readonly SeedUnitOutput[], maxSpeed: number): CatalogMetrics {
  const finals = outputs.map((output) => output.samples[output.samples.length - 1]);
  const initials = outputs.map((output) => output.samples[0]);
  const at = (pick: (sample: (typeof finals)[number]) => number): number =>
    medianOf(finals.map(pick));
  return {
    clusteredFraction: at((sample) => sample.clusteredFraction),
    clusterCount: at((sample) => sample.clusterCount),
    clusterCompactness: at((sample) => sample.clusterCompactness),
    clusterAnisotropy: at((sample) => sample.clusterAnisotropy),
    meanSpeed: at((sample) => sample.meanSpeed),
    maxSpeed,
    retention: medianOf(
      finals.map((sample, index) =>
        initials[index].activeCount > 0 ? sample.activeCount / initials[index].activeCount : 0,
      ),
    ),
    radialStructure: at((sample) => sample.radialStructure),
  };
}

function distributionOf(outputs: readonly SeedUnitOutput[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const output of outputs) {
    const key = output.classification.primary;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function runBatch(from: number, to: number): Promise<CandidateOutcome[]> {
  const units: { workId: string; input: Parameters<typeof runSeedUnit>[0] }[] = [];
  const invalid: number[] = [];
  for (let index = from; index < to; index++) {
    let text: string;
    try {
      text = serializeSubstrateCandidate(candidateAt(index));
    } catch {
      // Geçersiz örnek sessizce atlanmaz; oran raporlanır.
      invalid.push(index);
      continue;
    }
    for (const seed of seeds) {
      units.push({
        workId: `broad:${String(index).padStart(5, '0')}:${seed}`,
        input: {
          substrate: substrateConfig,
          candidateText: text,
          seed,
          tickCount: stage.tickCount,
          sampleInterval: stage.sampleInterval,
          metrics: { ...defaultMetricsConfig, sampleIntervalTicks: stage.sampleInterval },
          cluster: {
            ...defaultClusterConfig,
            sampleIntervalTicks: stage.sampleInterval,
            // Boşluk ve süreklilik ÖRNEK ARALIĞINA tam bölünmeli (tracker şartı).
            maxGapTicks: stage.sampleInterval * 2,
            minContinuityTicks: stage.sampleInterval * 2,
          },
          phase: { ...defaultPhaseConfig, sampleIntervalTicks: stage.sampleInterval },
          perturbation: defaultPerturbationConfig,
          perturbationSpecs: [],
        },
      });
    }
  }
  invalidCount += invalid.length;

  const results = await runUnits(units, WORKERS, 'seedWorker.mjs', runSeedUnit);
  const bySeedGroup = new Map<number, SeedUnitOutput[]>();
  for (const result of results) {
    const index = Number(result.workId.split(':')[1]);
    const list = bySeedGroup.get(index) ?? [];
    list.push(result.output);
    bySeedGroup.set(index, list);
  }
  return [...bySeedGroup.entries()].map(([index, outputs]) => {
    const aggregation = aggregateSeedVerdicts(outputs.map((output) => output.classification));
    const candidate = candidateAt(index);
    const metrics = summarize(outputs, candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick);
    return {
      index,
      primary: aggregation.majorityReason,
      structured: aggregation.structured,
      record: {
        index,
        genome: serializeSubstrateCandidate(candidate),
        primary: aggregation.majorityReason,
        structured: aggregation.structured,
        phaseDistribution: distributionOf(outputs),
        metrics,
      },
    };
  });
}

let invalidCount = 0;

function shares(outcomes: readonly CandidateOutcome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes) {
    const key = outcome.primary ?? 'ÇOĞUNLUK_YOK';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const total = Math.max(1, outcomes.length);
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(counts)) result[key] = count / total;
  return result;
}

const started = Date.now();
const half = Math.floor(CANDIDATE_COUNT / 2);
const firstHalf = await runBatch(0, half);
const secondHalf = await runBatch(half, CANDIDATE_COUNT);
const all = [...firstHalf, ...secondHalf];

const sharesN = shares(firstHalf);
const shares2N = shares(all);
const drift = Object.keys({ ...sharesN, ...shares2N }).map((key) => ({
  gerekçe: key,
  N: +((sharesN[key] ?? 0) * 100).toFixed(2),
  '2N': +((shares2N[key] ?? 0) * 100).toFixed(2),
  fark: +(Math.abs((sharesN[key] ?? 0) - (shares2N[key] ?? 0)) * 100).toFixed(2),
}));
const converged = drift.every((entry) => entry.fark <= 2);

const summary = {
  madde: 'F3',
  tarih: new Date().toISOString().slice(0, 10),
  adaySayısı: CANDIDATE_COUNT,
  seedSayısı: seeds.length,
  tickCount: stage.tickCount,
  süreDk: +((Date.now() - started) / 60000).toFixed(1),
  geçersizAday: invalidCount,
  geçersizOran: +(invalidCount / CANDIDATE_COUNT).toFixed(4),
  yapısalAday: all.filter((outcome) => outcome.structured).length,
  fazPayları: shares2N,
  yakınsama: { N: half, ikiN: CANDIDATE_COUNT, tablo: drift, yakınsadı: converged },
};

mkdirSync('benchmarks/results', { recursive: true });
writeFileSync('benchmarks/results/f3-broad.json', JSON.stringify(summary, null, 2), 'utf8');
/*
 * Aday kayıtları YALNIZ yapısal adaylar için yazılır: kısa listeye yalnız
 * onlar girebilir ve 2048 genomun tamamını saklamak sonucu okunmaz kılar.
 */
const records = all.filter((outcome) => outcome.structured).map((outcome) => outcome.record);
writeFileSync(
  'benchmarks/results/f3-candidates.jsonl',
  records.map((record) => JSON.stringify(record)).join('\n') + (records.length > 0 ? '\n' : ''),
  'utf8',
);
console.log(
  `F3: ${records.length} yapısal aday kaydı yazıldı (benchmarks/results/f3-candidates.jsonl)`,
);
console.log(
  `F3: ${CANDIDATE_COUNT} aday × ${seeds.length} seed — yapısal ${summary.yapısalAday}, ` +
    `geçersiz ${invalidCount}, yakınsadı=${converged}, süre ${summary.süreDk} dk`,
);
for (const entry of drift.sort((a, b) => b['2N'] - a['2N']).slice(0, 6)) {
  console.log(`  ${entry.gerekçe}: N=%${entry.N} 2N=%${entry['2N']} fark ${entry.fark} puan`);
}
