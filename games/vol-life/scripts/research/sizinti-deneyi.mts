import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { serializeSubstrateCandidate, type SubstrateCandidate } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { defaultClusterConfig } from '../morphology/clusterTracker';
import { defaultMetricsConfig } from '../morphology/metrics';
import { defaultPerturbationConfig } from '../morphology/perturbation';
import { defaultPhaseConfig } from '../morphology/phaseClassifier';
import {
  evaluateLongHorizon,
  runLongHorizonUnit,
  type LongHorizonUnitOutput,
} from '../morphology/longHorizon';
import { readSeedCorpus } from '../morphology/seedCorpus';
import { runUnits } from '../morphology/workerPool';
import type { SeedUnitInput } from '../morphology/seedRunner';
import { medianOf } from '../morphology/stats';

interface AuditionCatalog {
  entries: Array<{
    digest: string;
    genome: string;
  }>;
}

interface VariantDef {
  key: string;
  name: string;
  env: string;
  command: string;
  modifyCandidate?: (c: SubstrateCandidate) => SubstrateCandidate;
}

const VARIANTS: VariantDef[] = [
  {
    key: 'taban',
    name: 'Taban (bugünkü)',
    env: '',
    command: 'pnpm tsx scripts/research/sizinti-deneyi.mts taban',
  },
  {
    key: 'v0',
    name: 'V0 tidal=0',
    env: '',
    command: 'pnpm tsx scripts/research/sizinti-deneyi.mts v0',
    modifyCandidate: (c) => ({
      ...c,
      void: { ...c.void, tidalStrength: 0 },
    }),
  },
  {
    key: 'v1',
    name: 'V1 kıyı sürtünmesi',
    env: 'shore-friction',
    command: 'VOL_LIFE_EXP=shore-friction pnpm tsx scripts/research/sizinti-deneyi.mts v1',
  },
  {
    key: 'v2',
    name: 'V2 yumuşak duvar',
    env: 'soft-wall',
    command: 'VOL_LIFE_EXP=soft-wall pnpm tsx scripts/research/sizinti-deneyi.mts v2',
  },
  {
    key: 'k1',
    name: 'K1 (V3)',
    env: 'reseed',
    command: 'VOL_LIFE_EXP=reseed pnpm tsx scripts/research/sizinti-deneyi.mts k1',
  },
  {
    key: 'k2',
    name: 'K2 (V3 + V4)',
    env: 'reseed,hard-core',
    command: 'VOL_LIFE_EXP=reseed,hard-core pnpm tsx scripts/research/sizinti-deneyi.mts k2',
  },
  {
    key: 'k3',
    name: 'K3 (V3 + V4 + V0)',
    env: 'reseed,hard-core',
    command: 'VOL_LIFE_EXP=reseed,hard-core pnpm tsx scripts/research/sizinti-deneyi.mts k3',
    modifyCandidate: (c) => ({
      ...c,
      void: { ...c.void, tidalStrength: 0 },
    }),
  },
];

const HZ = 60;
const SAMPLE_TICKS = 300;
const MINUTES = 10;
const TOTAL_TICKS = MINUTES * 60 * HZ;
const WORKERS = 8;
const RESULTS_FILE = 'benchmarks/results/sizinti-deneyi.json';

const corpus = readSeedCorpus('benchmarks/fixtures/corpus-v1.json');
const targetSeeds = corpus.seeds.slice(0, 4);

const catalogRaw = JSON.parse(
  readFileSync('research-out/audition-catalog.json', 'utf8'),
) as AuditionCatalog;
const candidates = catalogRaw.entries.slice(0, 2);

function unitInput(candidate: SubstrateCandidate, seed: number): SeedUnitInput {
  return {
    substrate: substrateConfig,
    candidateText: serializeSubstrateCandidate(candidate),
    seed,
    tickCount: TOTAL_TICKS,
    sampleInterval: SAMPLE_TICKS,
    metrics: {
      ...defaultMetricsConfig,
      sampleIntervalTicks: SAMPLE_TICKS,
      trajectoryLagSeconds: SAMPLE_TICKS / HZ,
    },
    cluster: {
      ...defaultClusterConfig,
      sampleIntervalTicks: SAMPLE_TICKS,
      maxGapTicks: SAMPLE_TICKS * 2,
      minContinuityTicks: SAMPLE_TICKS * 2,
    },
    phase: { ...defaultPhaseConfig, sampleIntervalTicks: SAMPLE_TICKS },
    perturbation: defaultPerturbationConfig,
    perturbationSpecs: [],
  };
}

interface VariantSummary {
  variantKey: string;
  variantName: string;
  command: string;
  durationMs: number;
  retentionMedian: number;
  worstSeed: {
    seed: number;
    candidateDigest: string;
    retention: number;
  };
  phaseDistribution: Record<string, number>;
  activeCountMedian: number;
  meanCappedFraction: number;
  meanNeighborCount: number;
  meanLocalDensity: number;
  passed: boolean;
  failures: readonly string[];
  unitOutputs: Array<{
    candidateDigest: string;
    seed: number;
    retention: number;
    activeCount: number;
    primaryPhase: string;
  }>;
}

async function runVariant(variant: VariantDef): Promise<VariantSummary> {
  const envVal = process.env.VOL_LIFE_EXP || variant.env;
  process.env.VOL_LIFE_EXP = envVal;

  const units = candidates.flatMap((entry) => {
    let base = JSON.parse(entry.genome) as SubstrateCandidate;
    base = { ...base, scenario: { kind: 'intrinsic' } };
    if (variant.modifyCandidate) {
      base = variant.modifyCandidate(base);
    }
    return targetSeeds.map((seed) => ({
      workId: `${variant.key}:${entry.digest}:${String(seed).padStart(10, '0')}`,
      input: unitInput(base, seed),
    }));
  });

  const started = Date.now();
  const results = await runUnits(units, WORKERS, 'longHorizonWorker.mjs', runLongHorizonUnit);
  const durationMs = Date.now() - started;

  const outputs = results.map((r) => r.output);
  const verdict = evaluateLongHorizon(outputs);

  const retentions = outputs.map((o) => o.retention);
  const retentionMedian = medianOf(retentions);

  let worst = outputs[0];
  for (const o of outputs) {
    if (o.retention < worst.retention) worst = o;
  }

  const worstUnit = results.find((r) => r.output === worst);
  const worstCandidateDigest = worstUnit ? worstUnit.workId.split(':')[1] : '';

  const phaseDist: Record<string, number> = {};
  for (const o of outputs) {
    const primary = o.classification.primary;
    phaseDist[primary] = (phaseDist[primary] ?? 0) + 1;
  }

  const finalActiveCounts = outputs.map((o) => {
    const last = o.curve[o.curve.length - 1];
    return last?.activeCount ?? 0;
  });
  const activeCountMedian = medianOf(finalActiveCounts);

  let totalCapped = 0;
  let totalNeighbor = 0;
  let totalDensity = 0;
  let pointCount = 0;
  for (const o of outputs) {
    for (const p of o.curve) {
      totalCapped += p.cappedFraction;
      totalNeighbor += p.meanNeighborCount ?? 0;
      totalDensity += p.meanLocalDensity ?? 0;
      pointCount++;
    }
  }
  const meanCappedFraction = pointCount > 0 ? totalCapped / pointCount : 0;
  const meanNeighborCount = pointCount > 0 ? totalNeighbor / pointCount : 0;
  const meanLocalDensity = pointCount > 0 ? totalDensity / pointCount : 0;

  const unitDetails = results.map((r) => {
    const digest = r.workId.split(':')[1];
    const last = r.output.curve[r.output.curve.length - 1];
    return {
      candidateDigest: digest,
      seed: r.output.seed,
      retention: r.output.retention,
      activeCount: last?.activeCount ?? 0,
      primaryPhase: r.output.classification.primary,
    };
  });

  return {
    variantKey: variant.key,
    variantName: variant.name,
    command: variant.command,
    durationMs,
    retentionMedian,
    worstSeed: {
      seed: worst.seed,
      candidateDigest: worstCandidateDigest,
      retention: worst.retention,
    },
    phaseDistribution: phaseDist,
    activeCountMedian,
    meanCappedFraction,
    meanNeighborCount,
    meanLocalDensity,
    passed: verdict.passed,
    failures: verdict.failures,
    unitOutputs: unitDetails,
  };
}

function formatPhaseDist(dist: Record<string, number>): string {
  return Object.entries(dist)
    .map(([phase, count]) => `${phase} (${count})`)
    .join(', ');
}

function formatTable(summaries: VariantSummary[]): string {
  const rows = [
    '| Varyant | 10 dk madde tutma medyanı | En kötü tohum | Faz dağılımı | Kalan aktif parçacık (medyan) | cappedFraction ort. | meanNeighborCount ort. | meanLocalDensity ort. |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const s of summaries) {
    const retStr = `${(s.retentionMedian * 100).toFixed(1)}%`;
    const worstStr = `tohum ${s.worstSeed.seed} (${(s.worstSeed.retention * 100).toFixed(1)}%)`;
    const phaseStr = formatPhaseDist(s.phaseDistribution);
    const activeStr = `${Math.round(s.activeCountMedian)} / 512`;
    const capStr =
      s.meanCappedFraction !== undefined ? `${(s.meanCappedFraction * 100).toFixed(2)}%` : '-';
    const neighStr = s.meanNeighborCount !== undefined ? s.meanNeighborCount.toFixed(2) : '-';
    const densStr = s.meanLocalDensity !== undefined ? s.meanLocalDensity.toFixed(4) : '-';
    rows.push(
      `| ${s.variantName} | ${retStr} | ${worstStr} | ${phaseStr} | ${activeStr} | ${capStr} | ${neighStr} | ${densStr} |`,
    );
  }
  return rows.join('\n');
}

async function main() {
  const arg = (process.argv[2] ?? 'all').toLowerCase();

  let existingResults: Record<string, VariantSummary> = {};
  if (existsSync(RESULTS_FILE)) {
    try {
      existingResults = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
    } catch {
      existingResults = {};
    }
  }

  const selectedVariants = arg === 'all' ? VARIANTS : VARIANTS.filter((v) => v.key === arg);

  if (selectedVariants.length === 0) {
    console.error(
      `Bilinmeyen varyant: ${arg}. Geçerli seçenekler: all, ${VARIANTS.map((v) => v.key).join(
        ', ',
      )}`,
    );
    process.exit(1);
  }

  const runSummaries: VariantSummary[] = [];

  for (const variant of selectedVariants) {
    console.log(`\n=== ${variant.name} (${variant.command}) koşuluyor... ===`);
    const summary = await runVariant(variant);
    runSummaries.push(summary);
    existingResults[variant.key] = summary;
    console.log(`Tamamlandı: ${(summary.durationMs / 1000).toFixed(1)} sn`);
    console.log(
      `Tutma medyanı: ${(summary.retentionMedian * 100).toFixed(1)}% | En kötü tohum: ${
        summary.worstSeed.seed
      } (${(summary.worstSeed.retention * 100).toFixed(1)}%)`,
    );
    console.log(
      `Faz: ${formatPhaseDist(summary.phaseDistribution)} | Kalan parçacık: ${
        summary.activeCountMedian
      }`,
    );
  }

  writeFileSync(RESULTS_FILE, JSON.stringify(existingResults, null, 2), 'utf8');

  console.log('\n=== SIZINTI DENEYİ SONUÇ TABLOSU ===\n');
  const allSummaries = VARIANTS.map((v) => existingResults[v.key]).filter(
    (s): s is VariantSummary => s !== undefined,
  );
  console.log(formatTable(allSummaries));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
