import { cloneSubstrateCandidate, type SubstrateCandidate } from '@/config/candidate';
import type { SubstrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import { initialSpeedFor, seedingProfileAt } from './seedingSampler';
import {
  isAtSpeedCap,
  measureStartupSurvival,
  type StartupMetrics,
  type StartupSample,
} from './startupSurvival';

/**
 * F1 — seeding rejimi araştırması. Her profil, ön-kayıtlı §8.4 launch
 * envelope'una göre SEED BAŞINA değerlendirilir.
 *
 * Koşu 30 saniyedir, bu yüzden transient yatışması satırı burada ölçülmez:
 * o satırın bandı 20-60 sn medyanından çıkar ve 30 saniyelik koşuda tanımsızdır.
 * Burada ölçülen iki satır sağkalım ve erken patlamadır.
 */
export interface SeedingUnitInput {
  readonly substrate: SubstrateConfig;
  readonly profileIndex: number;
  readonly scrambleSeed: number;
  readonly seeds: readonly number[];
  readonly seconds: number;
  readonly simulationHz: number;
  readonly sampleIntervalTicks: number;
}

export interface SeedingSeedResult {
  readonly seed: number;
  readonly retention10: number;
  readonly retention30: number;
  readonly earlyBurstPeak: number;
  readonly passed: boolean;
}

export interface SeedingUnitOutput {
  readonly profileIndex: number;
  /** Yapılandırma doğrulamasından geçmeyen profil; sessizce atlanmaz. */
  readonly invalid: boolean;
  readonly invalidReason?: string;
  readonly profile: Record<string, unknown>;
  readonly seedResults: readonly SeedingSeedResult[];
  readonly passedSeedFraction: number;
  readonly medianRetention10: number;
}

/** §8.4 launch envelope, SEED BAŞINA. */
const RETENTION_10_MIN = 0.95;
const RETENTION_30_MIN = 0.9;
const EARLY_BURST_MAX = 0.1;

export function runSeedingUnit(input: SeedingUnitInput): SeedingUnitOutput {
  const base = input.substrate.candidate;
  const seeding = seedingProfileAt(input.profileIndex, input.scrambleSeed, input.substrate);
  const candidate: SubstrateCandidate = {
    ...cloneSubstrateCandidate(base),
    seeding: {
      ...seeding,
      initialSpeedUnitsPerReferenceTick: initialSpeedFor(
        input.profileIndex,
        base.physics.dynamics.maxSpeedUnitsPerReferenceTick,
        input.scrambleSeed,
      ),
    },
  };
  const config: SubstrateConfig = { ...input.substrate, candidate };
  const profileRecord = { ...candidate.seeding } as unknown as Record<string, unknown>;

  const seedResults: SeedingSeedResult[] = [];
  for (const seed of input.seeds) {
    let world: LifeWorld;
    try {
      world = new LifeWorld(config, createExplicitWorldMetadata(seed));
    } catch (error) {
      return {
        profileIndex: input.profileIndex,
        invalid: true,
        invalidReason: error instanceof Error ? error.message : String(error),
        profile: profileRecord,
        seedResults: [],
        passedSeedFraction: 0,
        medianRetention10: 0,
      };
    }
    const metrics = measureSeed(world, config, input);
    const passed =
      metrics.matterRetention10 >= RETENTION_10_MIN &&
      metrics.matterRetention30 >= RETENTION_30_MIN &&
      metrics.earlyBurstPeak <= EARLY_BURST_MAX;
    seedResults.push({
      seed,
      retention10: metrics.matterRetention10,
      retention30: metrics.matterRetention30,
      earlyBurstPeak: metrics.earlyBurstPeak,
      passed,
    });
  }

  const retentions = seedResults.map((result) => result.retention10).sort((a, b) => a - b);
  return {
    profileIndex: input.profileIndex,
    invalid: false,
    profile: profileRecord,
    seedResults,
    passedSeedFraction:
      seedResults.length > 0
        ? seedResults.filter((result) => result.passed).length / seedResults.length
        : 0,
    medianRetention10: retentions[Math.floor(retentions.length / 2)] ?? 0,
  };
}

function measureSeed(
  world: LifeWorld,
  config: SubstrateConfig,
  input: SeedingUnitInput,
): StartupMetrics {
  const maxSpeed = config.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
  const initialCount = world.particles.activeCount;
  const samples: StartupSample[] = [];
  const totalTicks = input.seconds * input.simulationHz;
  for (let tick = 0; tick <= totalTicks; tick++) {
    if (tick % input.sampleIntervalTicks === 0) {
      let alive = 0;
      let capped = 0;
      let speedSum = 0;
      for (let slot = 0; slot < world.particles.capacity; slot++) {
        if (world.particles.active[slot] === 0) continue;
        alive++;
        const speed = Math.hypot(world.particles.vx[slot], world.particles.vy[slot]);
        speedSum += speed;
        if (isAtSpeedCap(speed, maxSpeed)) capped++;
      }
      samples.push({
        seconds: tick / input.simulationHz,
        activeCount: alive,
        meanSpeed: alive > 0 ? speedSum / alive : 0,
        cappedFraction: alive > 0 ? capped / alive : 0,
        voidLossTotal: world.reservoir.voidLossTotal,
      });
    }
    world.step();
  }
  return measureStartupSurvival(
    { seed: 0, initialCount, samples },
    {
      retention10MedianMin: RETENTION_10_MIN,
      retention10WorstDecileMin: 0.9,
      retention30MedianMin: RETENTION_30_MIN,
      earlyBurstMaxCappedFraction: EARLY_BURST_MAX,
      earlyWindowSeconds: 10,
      settlingSeconds: input.seconds,
      settlingSeedFractionMin: 0.9,
      seedFailureFractionForReject: 0.5,
      // 30 saniyelik koşuda bant 20-30 sn'den çıkar; transient satırı burada ölçülmez.
      transientWindowStartSeconds: 20,
      transientWindowEndSeconds: input.seconds,
      transientBandMultiple: 1.2,
    },
  );
}
