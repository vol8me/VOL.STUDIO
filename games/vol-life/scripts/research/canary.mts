import { mkdirSync, writeFileSync } from 'node:fs';
import { serializeSubstrateCandidate, type SubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../morphology/clusterTracker';
import { defaultMetricsConfig } from '../morphology/metrics';
import { defaultPerturbationConfig } from '../morphology/perturbation';
import { defaultPhaseConfig } from '../morphology/phaseClassifier';
import { CheckpointStore } from '../morphology/checkpoint';
import {
  evaluateLongHorizon,
  runLongHorizonUnit,
  type LongHorizonUnitOutput,
} from '../morphology/longHorizon';
import { readSeedCorpus } from '../morphology/seedCorpus';
import { createGitProvider, readSourceState } from '../morphology/sourceState';
import { runUnits } from '../morphology/workerPool';

/*
 * Production canary (E14). PROMOTE EDİLMİŞ adayı aynı korpusta, perturbation
 * OLMADAN ve aynı sert FAIL kurallarıyla koşar. Canary düşerse promotion
 * commit'i yeni bir revert commit'iyle geri alınır; araştırma devam eder.
 *
 * Gerçek canary koşusu kullanıcı kabulünden sonraki ikinci koşunun işidir;
 * bu betik o koşunun komutudur.
 */
const MINUTES = Number(process.argv[2] ?? 30);
const WORKERS = Number(process.argv[3] ?? 8);
const MODULE = process.argv[4] ?? '../../src/config/substrateCandidate.ts';
const HZ = 60;
const SAMPLE_TICKS = 300;

const imported = (await import(MODULE)) as {
  promotedSubstrateCandidate: SubstrateCandidate;
  promotedCandidateProvenance: Record<string, string>;
};
const candidate = imported.promotedSubstrateCandidate;
const corpus = readSeedCorpus('benchmarks/fixtures/corpus-v1.json');
const source = readSourceState(createGitProvider(process.cwd()));
const totalTicks = MINUTES * 60 * HZ;

const store = new CheckpointStore<LongHorizonUnitOutput>(
  'benchmarks/results/canary-checkpoint.jsonl',
  `${source.revision}:${MINUTES}`,
);

const units = corpus.seeds
  .map((seed) => ({
    workId: `canary:${String(seed).padStart(10, '0')}`,
    input: {
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
      // Canary'de perturbation YOKTUR: ölçülen şey üretim koşulundaki dayanıklılık.
      perturbationSpecs: [],
    },
  }))
  .filter((unit) => !store.has(unit.workId));

const started = Date.now();
const fresh = await runUnits(units, WORKERS, 'longHorizonWorker.mjs', runLongHorizonUnit);
for (const result of fresh) store.record(result.workId, result.output);
const outputs = corpus.seeds
  .map((seed) => store.get(`canary:${String(seed).padStart(10, '0')}`))
  .filter((value): value is LongHorizonUnitOutput => value !== undefined);

const verdict = evaluateLongHorizon(outputs);
const summary = {
  madde: 'E14-canary',
  tarih: new Date().toISOString().slice(0, 10),
  revision: source.revision,
  temizKaynak: !source.dirty,
  provenance: imported.promotedCandidateProvenance,
  korpus: corpus.id,
  dakika: MINUTES,
  süreDk: +((Date.now() - started) / 60000).toFixed(1),
  verdict,
};

mkdirSync('benchmarks/results', { recursive: true });
writeFileSync('benchmarks/results/canary.json', JSON.stringify(summary, null, 2), 'utf8');
console.log(
  `Canary ${verdict.passed ? 'GEÇTİ' : 'DÜŞTÜ'} — koruma medyan ` +
    `${verdict.retentionMedian.toFixed(3)}, en kötü ${verdict.retentionMin.toFixed(3)}, ` +
    `yapısal %${(verdict.structuredShare * 100).toFixed(0)}` +
    (verdict.failures.length > 0 ? ` — ${verdict.failures.join('; ')}` : ''),
);
if (!verdict.passed) process.exitCode = 1;
