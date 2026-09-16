import { performance } from 'node:perf_hooks';
import { PARTICLE_TYPE_COUNT, defaultPhysicsGenome } from '../../src/config/genome';
import { particleConfig } from '../../src/config/particles';
import { substrateConfig } from '../../src/config/substrate';
import { seedInitialMatter } from '../../src/runtime/sim/InitialMatterSeeder';
import { MatterReservoir } from '../../src/runtime/sim/MatterReservoir';
import { createMultiBandKernel } from '../../src/runtime/sim/PairForceKernel';
import {
  accumulateParticleForces,
  integrateParticles,
} from '../../src/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '../../src/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '../../src/runtime/sim/ParticleStore';
import { VoidSink } from '../../src/runtime/sim/VoidSink';
import {
  createHabitatDomain,
  type DomainSample,
  type WorldDomain,
} from '../../src/runtime/sim/WorldDomain';
import type { VoidDeathEvent } from '../../src/runtime/sim/WorldEvents';
import { createSimRandom, type SimRandom } from '../../src/runtime/sim/rng';

const SEED = 0x10fe1;
const DEFAULT_WARMUP_STEPS = 60;
/** Tabakalı ızgara sayıdan en az iki kat hücre açar; habitat dışı hücreler elenince yer kalsın. */
const STRATIFIED_OVERSAMPLE = 2;

export interface ScalingCandidate {
  readonly particles: number;
  readonly worldSize: number;
}

export interface ScalingOptions {
  readonly iterations: number;
  readonly samples: number;
  readonly warmupSteps?: number;
}

export interface ScalingEntry {
  readonly particles: number;
  readonly active: number;
  readonly maxPerCell: number;
  readonly candidatePairsPerParticle: number;
  readonly msPerTick: number;
  readonly p95MsPerTick: number;
}

export interface ScalingReport {
  readonly particleKernel: readonly ScalingEntry[];
  readonly productionSeeding: readonly ScalingEntry[];
}

/** Dünya kenarı parçacık sayısıyla birlikte iki katına çıkar: küresel yoğunluk sabit kalır. */
export const SCALING_CANDIDATES: readonly ScalingCandidate[] = [
  { particles: 512, worldSize: 1024 },
  { particles: 2048, worldSize: 2048 },
];

type Placement = (
  particles: ParticleStore,
  random: SimRandom,
  domain: WorldDomain,
  count: number,
) => void;

/**
 * İki seri AYNI çekirdeği ölçer, yalnız YERLEŞİM farklıdır:
 *
 * - `particleKernel` (algoritmik): habitat içinde tabakalı ızgara. Yerel
 *   yoğunluk girdiden bağımsızdır, dolayısıyla süre oranı hash + kuvvet
 *   karmaşıklığını gösterir. Ölçekleme kapısı BU seriye bağlanır.
 * - `productionSeeding` (ürün): gerçek seeder ve üretim adayı. Sabit yama
 *   yarıçapı yüzünden 4× parçacık aynı yamalarda yoğunlaşır; bu serinin oranı
 *   gerçek iş yükünü anlatır ama karmaşıklık kapısı olamaz.
 */
export function buildScalingReport(options: ScalingOptions): ScalingReport {
  return {
    particleKernel: SCALING_CANDIDATES.map((candidate) =>
      measure(candidate, options, placeStratified),
    ),
    productionSeeding: SCALING_CANDIDATES.map((candidate) =>
      measure(candidate, options, placeProduction),
    ),
  };
}

function measure(
  candidate: ScalingCandidate,
  options: ScalingOptions,
  place: Placement,
): ScalingEntry {
  const bounds = { x: 0, y: 0, width: candidate.worldSize, height: candidate.worldSize };
  const domain = createHabitatDomain(bounds, substrateConfig.habitat, SEED);
  const particles = new ParticleStore(candidate.particles);
  place(particles, createSimRandom(SEED), domain, candidate.particles);
  const grid = new ParticleSpatialHash(bounds, particleConfig.cellSizeUnits, candidate.particles);
  const kernel = createMultiBandKernel(defaultPhysicsGenome);
  const sink = new VoidSink(domain, defaultPhysicsGenome.fringe);
  const reservoir = new MatterReservoir();
  const crossings: VoidDeathEvent[] = [];
  let tick = 0;
  const step = (): void => {
    crossings.length = 0;
    tick++;
    grid.rebuild(particles);
    accumulateParticleForces(particles, grid, kernel, 1);
    sink.applyFringeStress(particles);
    integrateParticles(
      particles,
      defaultPhysicsGenome.dynamics,
      particleConfig.referenceHz,
      1000 / particleConfig.referenceHz,
    );
    sink.collectCrossings(particles, reservoir, tick, crossings);
  };

  const warmup = options.warmupSteps ?? DEFAULT_WARMUP_STEPS;
  for (let index = 0; index < warmup; index++) step();
  const occupancy = measureOccupancy(grid);
  const samples: number[] = [];
  for (let sample = 0; sample < options.samples; sample++) {
    const startedAt = performance.now();
    for (let iteration = 0; iteration < options.iterations; iteration++) step();
    samples.push((performance.now() - startedAt) / options.iterations);
  }
  samples.sort((left, right) => left - right);
  return {
    particles: candidate.particles,
    active: particles.activeCount,
    maxPerCell: occupancy.maxPerCell,
    candidatePairsPerParticle: occupancy.candidatePairsPerParticle,
    msPerTick: percentile(samples, 0.5),
    p95MsPerTick: percentile(samples, 0.95),
  };
}

/**
 * Kuvvet yolu her parçacık için 3×3 hücre komşuluğunu tarar; ölçülen sayı
 * mesafe testine giren aday sayısıdır, kabul edilen çift değil. Doluluk
 * sabit kalmadan süre oranı karmaşıklık ölçmez — rapor bu yüzden ikisini
 * birlikte taşır.
 */
function measureOccupancy(grid: ParticleSpatialHash): {
  maxPerCell: number;
  candidatePairsPerParticle: number;
} {
  let maxPerCell = 0;
  let candidates = 0;
  for (let cell = 0; cell < grid.cellCount; cell++) {
    const occupants = grid.end(cell) - grid.start(cell);
    if (occupants === 0) continue;
    maxPerCell = Math.max(maxPerCell, occupants);
    const cellX = cell % grid.cellsX;
    const cellY = (cell / grid.cellsX) | 0;
    let neighbourhood = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const neighbour = grid.cellIndex(cellX + dx, cellY + dy);
        if (neighbour === null) continue;
        neighbourhood += grid.end(neighbour) - grid.start(neighbour);
      }
    }
    candidates += occupants * (neighbourhood - 1);
  }
  const indexed = grid.indexedCount;
  return {
    maxPerCell,
    candidatePairsPerParticle: indexed > 0 ? candidates / indexed : 0,
  };
}

/**
 * Habitat içindeki geçerli ızgara noktaları toplanır ve aralarından EŞİT
 * ARALIKLA `count` tanesi seçilir; böylece parçacıklar habitatın tamamına
 * yayılır ve yerel yoğunluk yalnız count/habitat alanına bağlı kalır. Dünya
 * kenarı da parçacıkla birlikte iki katına çıktığı için iki adayda yoğunluk
 * aynıdır.
 */
const placeStratified: Placement = (particles, random, domain, count) => {
  const { bbox } = domain;
  const safeDistance = defaultPhysicsGenome.fringe.widthUnits;
  const sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };
  const cells = Math.ceil(Math.sqrt(count * STRATIFIED_OVERSAMPLE));
  const stepX = bbox.width / cells;
  const stepY = bbox.height / cells;
  const valid: number[] = [];
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const x = bbox.x + (column + 0.5) * stepX;
      const y = bbox.y + (row + 0.5) * stepY;
      if (domain.sampleDistanceAndNormal(x, y, sample).distance >= safeDistance) {
        valid.push(x, y);
      }
    }
  }
  const available = valid.length / 2;
  if (available < count) {
    throw new RangeError(`Tabakalı ızgara ${count} nokta taşıyamadı: ${available}`);
  }
  const { initialSpeedUnitsPerReferenceTick } = defaultPhysicsGenome.dynamics;
  for (let index = 0; index < count; index++) {
    const pick = Math.floor((index * available) / count);
    const angle = random.next() * Math.PI * 2;
    const speed = random.next() * initialSpeedUnitsPerReferenceTick;
    particles.activateSlot(
      valid[pick * 2],
      valid[pick * 2 + 1],
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      index % PARTICLE_TYPE_COUNT,
    );
  }
};

/** Tür dağılımı, yama sayısı ve hız profili üretimdeki neyse odur. */
const placeProduction: Placement = (particles, random, domain, count) => {
  seedInitialMatter(particles, random, domain, defaultPhysicsGenome, count);
};

function percentile(values: readonly number[], ratio: number): number {
  return values[Math.ceil(values.length * ratio) - 1];
}
