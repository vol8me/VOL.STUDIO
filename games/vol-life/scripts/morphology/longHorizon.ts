import type { MorphologySample } from './metrics';
import { runSeedUnit, type SeedUnitInput } from './seedRunner';
import type { PerturbationResult } from './perturbation';
import type { PhaseClassification, ReasonCode } from './phaseClassifier';
import { medianOf } from './stats';

/**
 * Çoklu-seed uzun ufuk koşusu (F7) ve geç çöküş eğrileri (F8).
 *
 * Bir koşunun TAM örnek dizisi saklanamaz: 8 aday × 2 senaryo × 32 seed'in
 * her örneğinde küme kayıtları da var. Eğri, §8.4'ün ve çöküş dedektörünün
 * GERÇEKTEN okuduğu alanlara indirgenir; indirgeme worker içinde yapılır ki
 * büyük yük iş parçacığı sınırını hiç geçmesin.
 */
export interface LongHorizonPoint {
  readonly tick: number;
  readonly activeCount: number;
  readonly clusteredFraction: number;
  readonly clusterCount: number;
  readonly meanSpeed: number;
  readonly voidLossCount: number;
  readonly cappedFraction: number;
  readonly fringeStructuredFraction: number;
  /** Kümelerin madde-ağırlıklı kadro değişimi. */
  readonly churn: number;
  /** En uzun yaşayan kümenin yaşı; yapı ömrünün alt sınırı. */
  readonly oldestClusterTicks: number;
}

export interface LongHorizonUnitOutput {
  readonly seed: number;
  readonly scenario: string;
  readonly initialCount: number;
  readonly retention: number;
  readonly classification: PhaseClassification;
  readonly perturbations: readonly PerturbationResult[];
  readonly curve: readonly LongHorizonPoint[];
  readonly ticks: number;
}

/**
 * Seri yol ve worker yolu AYNI fonksiyonu çağırır (E12 ilkesi): iki ayrı
 * indirgeme, paralel ile serinin sessizce ayrışması demek olurdu. Senaryo
 * etiketi adayın KENDİ metninden okunur, çağıranın söylediğinden değil.
 */
export function runLongHorizonUnit(input: SeedUnitInput): LongHorizonUnitOutput {
  const output = runSeedUnit(input);
  const curve = output.samples.map(compactSample);
  const initialCount = curve[0]?.activeCount ?? 0;
  const last = curve[curve.length - 1];
  return {
    seed: output.seed,
    scenario: scenarioOf(input.candidateText),
    initialCount,
    retention: initialCount > 0 ? (last?.activeCount ?? 0) / initialCount : 0,
    classification: output.classification,
    perturbations: output.perturbations,
    curve,
    ticks: output.ticks,
  };
}

export function scenarioOf(candidateText: string): string {
  const parsed = JSON.parse(candidateText) as { scenario?: { kind?: string } };
  const kind = parsed.scenario?.kind;
  if (!kind) throw new RangeError('Aday metni senaryo taşımalı.');
  return kind;
}

export function compactSample(sample: MorphologySample): LongHorizonPoint {
  let weighted = 0;
  let members = 0;
  let oldest = 0;
  for (const cluster of sample.clusters) {
    weighted += cluster.churn * cluster.size;
    members += cluster.size;
    oldest = Math.max(oldest, cluster.ageTicks);
  }
  return {
    tick: sample.tick,
    activeCount: sample.activeCount,
    clusteredFraction: sample.clusteredFraction,
    clusterCount: sample.clusterCount,
    meanSpeed: sample.meanSpeed,
    voidLossCount: sample.voidLossCount,
    cappedFraction: sample.cappedFraction,
    fringeStructuredFraction: sample.fringeStructuredFraction,
    churn: members > 0 ? weighted / members : 0,
    oldestClusterTicks: oldest,
  };
}

/** §8.4 uzun ufuk eşikleri; hiçbiri koşu sırasında değişmez. */
export interface LongHorizonGate {
  readonly retentionMedian: number;
  readonly retentionWorstSeed: number;
  readonly hardFailSeedShare: number;
  readonly structuredSeedShare: number;
  readonly recoverySeedShare: number;
}

export const defaultLongHorizonGate: LongHorizonGate = {
  retentionMedian: 0.7,
  retentionWorstSeed: 0.4,
  hardFailSeedShare: 0.5,
  structuredSeedShare: 0.75,
  recoverySeedShare: 0.75,
};

export interface LongHorizonVerdict {
  readonly seedCount: number;
  readonly retentionMedian: number;
  readonly retentionMin: number;
  readonly structuredShare: number;
  readonly recoveredShare: number;
  readonly hardFailShares: Readonly<Record<string, number>>;
  readonly failures: readonly string[];
  readonly passed: boolean;
}

/** DYNAMIC_STRUCTURED dışındaki her gerekçe sert FAIL sayılır (§8.4). */
export function evaluateLongHorizon(
  outputs: readonly LongHorizonUnitOutput[],
  gate: LongHorizonGate = defaultLongHorizonGate,
): LongHorizonVerdict {
  if (outputs.length === 0) throw new RangeError('Uzun ufuk değerlendirmesi en az bir seed ister.');
  const retentions = outputs.map((output) => output.retention);
  const retentionMedian = medianOf(retentions);
  const retentionMin = Math.min(...retentions);
  const structuredShare = share(
    outputs,
    (output) => output.classification.primary === 'DYNAMIC_STRUCTURED',
  );
  const recoveredShare = share(outputs, (output) =>
    output.perturbations.every((result) => result.recovered),
  );
  const hardFailShares = failShares(outputs);

  const failures: string[] = [];
  if (retentionMedian < gate.retentionMedian) {
    failures.push(`30 dk koruma medyanı ${retentionMedian.toFixed(3)} < ${gate.retentionMedian}`);
  }
  if (retentionMin < gate.retentionWorstSeed) {
    failures.push(`en kötü seed koruması ${retentionMin.toFixed(3)} < ${gate.retentionWorstSeed}`);
  }
  if (structuredShare < gate.structuredSeedShare) {
    failures.push(
      `DYNAMIC_STRUCTURED payı ${(structuredShare * 100).toFixed(0)}% < ` +
        `${gate.structuredSeedShare * 100}%`,
    );
  }
  if (outputs.some((output) => output.perturbations.length > 0)) {
    if (recoveredShare < gate.recoverySeedShare) {
      failures.push(
        `toparlanan seed payı ${(recoveredShare * 100).toFixed(0)}% < ` +
          `${gate.recoverySeedShare * 100}%`,
      );
    }
  }
  for (const [reason, value] of Object.entries(hardFailShares)) {
    if (value >= gate.hardFailSeedShare) {
      failures.push(`${reason} seed'lerin ${(value * 100).toFixed(0)}%'inde`);
    }
  }

  return {
    seedCount: outputs.length,
    retentionMedian,
    retentionMin,
    structuredShare,
    recoveredShare,
    hardFailShares,
    failures,
    passed: failures.length === 0,
  };
}

function share(
  outputs: readonly LongHorizonUnitOutput[],
  predicate: (output: LongHorizonUnitOutput) => boolean,
): number {
  return outputs.filter(predicate).length / outputs.length;
}

function failShares(outputs: readonly LongHorizonUnitOutput[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const output of outputs) {
    const reason: ReasonCode = output.classification.primary;
    if (reason === 'DYNAMIC_STRUCTURED') continue;
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  const shares: Record<string, number> = {};
  for (const [reason, count] of Object.entries(counts)) shares[reason] = count / outputs.length;
  return shares;
}
