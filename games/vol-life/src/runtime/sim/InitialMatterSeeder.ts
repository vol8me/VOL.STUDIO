import { PARTICLE_TYPE_COUNT, type PhysicsGenome } from '@/config/genome';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { SimRandom } from '@/runtime/sim/rng';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';

const PLACEMENT_ATTEMPTS = 96;

export interface SeedingSummary {
  readonly patchCenters: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly patchCount: number;
  readonly cloudCount: number;
  readonly sparseCount: number;
}

/**
 * Başlangıç maddesini yoğun origin yamaları, serbest bulut ve seyrek bölgeye
 * dağıtır (DESIGN.md §2). Hiçbir yapı çizmez; yalnız lokal etkileşimin
 * başlayabileceği madde koşulunu kurar. Her parçacık fringe'in gerisinde doğar.
 */
export function seedInitialMatter(
  particles: ParticleStore,
  random: SimRandom,
  domain: WorldDomain,
  genome: PhysicsGenome,
  count = particles.capacity,
): SeedingSummary {
  if (!Number.isInteger(count) || count < 1 || count > particles.capacity) {
    throw new RangeError(`Başlangıç madde sayısı 1–${particles.capacity} aralığında olmalı`);
  }
  if (particles.activeCount !== 0) throw new RangeError('Seeder yalnız boş depoya ekilir.');
  const { seeding, fringe, dynamics } = genome;
  const safeDistance = fringe.widthUnits;
  const centers = Array.from({ length: seeding.patchCount }, () =>
    placeInside(random, domain, seeding.patchRadiusUnits + safeDistance),
  );
  const patchCount = Math.round(count * seeding.patchFraction);
  const cloudCount = Math.round(count * seeding.cloudFraction);
  const sparseCount = count - patchCount - cloudCount;
  const cloudRadius = seeding.patchRadiusUnits * seeding.cloudRadiusRatio;
  const spawn = (x: number, y: number): void => {
    const angle = random.next() * Math.PI * 2;
    const speed = dynamics.initialSpeedUnitsPerReferenceTick * random.next();
    particles.activateSlot(
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      pickType(random, seeding.typeWeights),
    );
  };
  for (let index = 0; index < patchCount; index++) {
    const center = centers[index % centers.length];
    const point = placeNear(random, domain, center, safeDistance, () => {
      const [gx, gy] = gaussianPair(random);
      const sigma = seeding.patchRadiusUnits / 2;
      return { x: center.x + gx * sigma, y: center.y + gy * sigma };
    });
    spawn(point.x, point.y);
  }
  for (let index = 0; index < cloudCount; index++) {
    const center = centers[index % centers.length];
    const point = placeNear(random, domain, center, safeDistance, () => {
      const angle = random.next() * Math.PI * 2;
      const radius = Math.sqrt(random.next()) * cloudRadius;
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    });
    spawn(point.x, point.y);
  }
  for (let index = 0; index < sparseCount; index++) {
    const point = placeInside(random, domain, safeDistance);
    spawn(point.x, point.y);
  }
  return { patchCenters: centers, patchCount, cloudCount, sparseCount };
}

function placeInside(
  random: SimRandom,
  domain: WorldDomain,
  minDistance: number,
): { x: number; y: number } {
  const { bbox } = domain;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const x = bbox.x + random.next() * bbox.width;
    const y = bbox.y + random.next() * bbox.height;
    if (domain.distance(x, y) >= minDistance) return { x, y };
  }
  return habitatCenter(domain);
}

function placeNear(
  random: SimRandom,
  domain: WorldDomain,
  center: { x: number; y: number },
  minDistance: number,
  propose: () => { x: number; y: number },
): { x: number; y: number } {
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const point = propose();
    if (domain.distance(point.x, point.y) >= minDistance) return point;
  }
  return domain.distance(center.x, center.y) >= minDistance
    ? center
    : placeInside(random, domain, minDistance);
}

function habitatCenter(domain: WorldDomain): { x: number; y: number } {
  return { x: domain.bbox.x + domain.bbox.width / 2, y: domain.bbox.y + domain.bbox.height / 2 };
}

function gaussianPair(random: SimRandom): [number, number] {
  const u1 = Math.max(random.next(), Number.EPSILON);
  const u2 = random.next();
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  return [magnitude * Math.cos(Math.PI * 2 * u2), magnitude * Math.sin(Math.PI * 2 * u2)];
}

function pickType(random: SimRandom, weights: readonly number[]): number {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = random.next() * total;
  for (let type = 0; type < PARTICLE_TYPE_COUNT; type++) {
    roll -= weights[type];
    if (roll < 0) return type;
  }
  return PARTICLE_TYPE_COUNT - 1;
}
