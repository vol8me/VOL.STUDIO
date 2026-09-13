import type { Rect } from '@volstudio/core/math/geometry';
import type { ParticleConfig } from '@/config/particles';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export interface ParticleCluster {
  readonly members: readonly number[];
  readonly centerX: number;
  readonly centerY: number;
  readonly meanRadius: number;
  readonly layering: number;
  readonly radialLayering: number;
  readonly orbitCoherence: number;
  readonly orbitActivity: number;
  readonly compactness: number;
  readonly shapeAnisotropy: number;
  readonly neighborLinks: number;
  readonly typeComposition: readonly number[];
}

export interface MorphologyFrameMetrics {
  readonly clusteredFraction: number;
  readonly clusterCount: number;
  readonly largestClusterShare: number;
  readonly meanLayering: number;
  readonly meanRadialLayering: number;
  readonly meanSpeed: number;
  readonly medianSpeed: number;
  readonly averageNeighborCount: number;
  readonly movingFraction: number;
  readonly nearlyStalledFraction: number;
  readonly staticFraction: number;
  readonly fragmentation: number;
  readonly collapse: number;
  readonly orbitDominance: number;
  readonly orbitActivity: number;
  readonly isolatedFraction: number;
  readonly stalledIsolatedFraction: number;
  readonly wallContactFraction: number;
  readonly wallSupportedStructureFraction: number;
  readonly meanCompactness: number;
  readonly meanShapeAnisotropy: number;
}

export interface StructureRecoveryMetrics {
  readonly membership: number;
  readonly typeComposition: number;
  readonly radialProfile: number;
  readonly compactness: number;
  readonly centroidAndSize: number;
  readonly shape: number;
}

import type { MorphologyAnalysisOptions } from '@/config/morphology';
export type { MorphologyAnalysisOptions };

export function detectParticleClusters(
  particles: ParticleStore,
  bounds: Readonly<Rect>,
  cellSizeUnits: number,
  clusterRadiusUnits: number,
  roleByType: readonly number[],
): ParticleCluster[] {
  if (!(clusterRadiusUnits > 0) || clusterRadiusUnits > cellSizeUnits) {
    throw new RangeError('Küme yarıçapı pozitif ve spatial hash hücresinden büyük olmamalı.');
  }
  validateRoles(roleByType);
  const grid = new ParticleSpatialHash(bounds, cellSizeUnits, particles.count);
  grid.rebuild(particles);
  const parent = new Int32Array(particles.count);
  const sizes = new Uint32Array(particles.count);
  for (let index = 0; index < particles.count; index++) {
    parent[index] = index;
    sizes[index] = 1;
  }
  const radiusSquared = clusterRadiusUnits ** 2;
  for (let index = 0; index < particles.count; index++) {
    const cellX = Math.floor((particles.x[index] - bounds.x) / cellSizeUnits);
    const cellY = Math.floor((particles.y[index] - bounds.y) / cellSizeUnits);
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const cell = grid.cellIndex(cellX + offsetX, cellY + offsetY);
        if (cell === null) continue;
        for (let slot = grid.start(cell); slot < grid.end(cell); slot++) {
          const other = grid.particleAt(slot);
          if (other <= index) continue;
          const dx = particles.x[other] - particles.x[index];
          const dy = particles.y[other] - particles.y[index];
          if (dx * dx + dy * dy <= radiusSquared) union(parent, sizes, index, other);
        }
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < particles.count; index++) {
    const root = find(parent, index);
    const members = groups.get(root) ?? [];
    members.push(index);
    groups.set(root, members);
  }
  return [...groups.values()].map((members) =>
    describeCluster(particles, members, clusterRadiusUnits, roleByType),
  );
}

export function analyzeMorphologyFrame(
  particles: ParticleStore,
  bounds: Readonly<Rect>,
  config: ParticleConfig,
  options: MorphologyAnalysisOptions,
  contactBounds: Readonly<Rect> = bounds,
): MorphologyFrameMetrics {
  const clusters = detectParticleClusters(
    particles,
    bounds,
    config.cellSizeUnits,
    options.clusterRadiusUnits,
    options.roleByType,
  );
  const structures = clusters.filter(
    (cluster) => cluster.members.length >= options.minimumClusterSize,
  );
  const structuredParticles = structures.reduce((sum, cluster) => sum + cluster.members.length, 0);
  const largest = structures.reduce((size, cluster) => Math.max(size, cluster.members.length), 0);
  let speedSum = 0;
  let moving = 0;
  let nearlyStalled = 0;
  let stalledIsolated = 0;
  let wallContacts = 0;
  const isolated = clusters.filter((cluster) => cluster.members.length === 1);
  const isolatedMembers = new Set(isolated.flatMap((cluster) => cluster.members));
  const wallContactByParticle = new Uint8Array(particles.count);
  const speeds: number[] = [];
  const minX = contactBounds.x + config.radiusUnits;
  const maxX = contactBounds.x + contactBounds.width - config.radiusUnits;
  const minY = contactBounds.y + config.radiusUnits;
  const maxY = contactBounds.y + contactBounds.height - config.radiusUnits;
  for (let index = 0; index < particles.count; index++) {
    const speed = Math.hypot(particles.vx[index], particles.vy[index]);
    speeds.push(speed);
    speedSum += speed;
    if (speed >= options.movingSpeedUnitsPerReferenceTick) moving++;
    if (speed < options.nearlyStalledSpeedUnitsPerReferenceTick) {
      nearlyStalled++;
      if (isolatedMembers.has(index)) stalledIsolated++;
    }
    const wallDistance = Math.min(
      particles.x[index] - minX,
      maxX - particles.x[index],
      particles.y[index] - minY,
      maxY - particles.y[index],
    );
    if (wallDistance <= options.wallContactDistanceUnits) {
      wallContactByParticle[index] = 1;
      wallContacts++;
    }
  }
  const orbitParticles = structures.reduce(
    (sum, cluster) => sum + cluster.orbitCoherence * cluster.members.length,
    0,
  );
  const orbitActivityParticles = structures.reduce(
    (sum, cluster) => sum + cluster.orbitActivity * cluster.members.length,
    0,
  );
  const wallSupportedParticles = structures.reduce((sum, cluster) => {
    const contacts = cluster.members.reduce(
      (count, index) => count + wallContactByParticle[index],
      0,
    );
    const supported =
      contacts >= Math.max(2, Math.ceil(cluster.members.length * options.wallSupportShare));
    return sum + (supported ? cluster.members.length : 0);
  }, 0);
  speeds.sort((left, right) => left - right);
  return {
    clusteredFraction: structuredParticles / particles.count,
    clusterCount: structures.length,
    largestClusterShare: largest / particles.count,
    meanLayering:
      structuredParticles === 0
        ? 0
        : structures.reduce((sum, cluster) => sum + cluster.layering * cluster.members.length, 0) /
          structuredParticles,
    meanRadialLayering:
      structuredParticles === 0
        ? 0
        : structures.reduce(
            (sum, cluster) => sum + cluster.radialLayering * cluster.members.length,
            0,
          ) / structuredParticles,
    meanSpeed: speedSum / particles.count,
    medianSpeed: median(speeds),
    averageNeighborCount:
      structures.reduce((sum, cluster) => sum + cluster.neighborLinks, 0) / particles.count,
    movingFraction: moving / particles.count,
    nearlyStalledFraction: nearlyStalled / particles.count,
    staticFraction: 1 - moving / particles.count,
    fragmentation: Math.min(
      1,
      structures.length / Math.max(1, particles.count / options.minimumClusterSize),
    ),
    collapse: Math.max(0, (largest / particles.count - 0.82) / 0.18),
    orbitDominance: orbitParticles / particles.count,
    orbitActivity: orbitActivityParticles / particles.count,
    isolatedFraction: isolated.length / particles.count,
    stalledIsolatedFraction: stalledIsolated / particles.count,
    wallContactFraction: wallContacts / particles.count,
    wallSupportedStructureFraction: wallSupportedParticles / Math.max(1, structuredParticles),
    meanCompactness:
      structuredParticles === 0
        ? 0
        : structures.reduce(
            (sum, cluster) => sum + cluster.compactness * cluster.members.length,
            0,
          ) / structuredParticles,
    meanShapeAnisotropy:
      structuredParticles === 0
        ? 0
        : structures.reduce(
            (sum, cluster) => sum + cluster.shapeAnisotropy * cluster.members.length,
            0,
          ) / structuredParticles,
  };
}

export function compareClusterMembership(
  before: readonly Pick<ParticleCluster, 'members'>[],
  after: readonly Pick<ParticleCluster, 'members'>[],
): number {
  const totalMembers = before.reduce((sum, cluster) => sum + cluster.members.length, 0);
  if (totalMembers === 0) return after.length === 0 ? 1 : 0;
  return (
    before.reduce((weightedScore, cluster) => {
      const members = new Set(cluster.members);
      const bestMatch = after.reduce((best, candidate) => {
        let intersection = 0;
        for (const member of candidate.members) if (members.has(member)) intersection++;
        const union = members.size + candidate.members.length - intersection;
        return Math.max(best, union === 0 ? 1 : intersection / union);
      }, 0);
      return weightedScore + bestMatch * cluster.members.length;
    }, 0) / totalMembers
  );
}

export function compareClusterStructure(
  before: readonly ParticleCluster[],
  after: readonly ParticleCluster[],
): StructureRecoveryMetrics {
  const totalMembers = before.reduce((sum, cluster) => sum + cluster.members.length, 0);
  if (totalMembers === 0) {
    const score = after.length === 0 ? 1 : 0;
    return {
      membership: score,
      typeComposition: score,
      radialProfile: score,
      compactness: score,
      centroidAndSize: score,
      shape: score,
    };
  }
  const totals = {
    membership: 0,
    typeComposition: 0,
    radialProfile: 0,
    compactness: 0,
    centroidAndSize: 0,
    shape: 0,
  };
  for (const cluster of before) {
    const match = bestMembershipMatch(cluster, after);
    const weight = cluster.members.length;
    if (!match) continue;
    totals.membership += match.score * weight;
    totals.typeComposition +=
      vectorSimilarity(cluster.typeComposition, match.cluster.typeComposition) * weight;
    totals.radialProfile +=
      mean([
        ratioSimilarity(cluster.meanRadius, match.cluster.meanRadius),
        differenceSimilarity(cluster.radialLayering, match.cluster.radialLayering),
      ]) * weight;
    totals.compactness +=
      differenceSimilarity(cluster.compactness, match.cluster.compactness) * weight;
    const centroidDistance = Math.hypot(
      cluster.centerX - match.cluster.centerX,
      cluster.centerY - match.cluster.centerY,
    );
    totals.centroidAndSize +=
      mean([
        ratioSimilarity(cluster.members.length, match.cluster.members.length),
        Math.exp(-centroidDistance / Math.max(1, cluster.meanRadius * 2)),
      ]) * weight;
    totals.shape +=
      differenceSimilarity(cluster.shapeAnisotropy, match.cluster.shapeAnisotropy) * weight;
  }
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, value / totalMembers]),
  ) as unknown as StructureRecoveryMetrics;
}

function bestMembershipMatch(
  target: ParticleCluster,
  candidates: readonly ParticleCluster[],
): { readonly cluster: ParticleCluster; readonly score: number } | null {
  let best: { readonly cluster: ParticleCluster; readonly score: number } | null = null;
  const members = new Set(target.members);
  for (const cluster of candidates) {
    let intersection = 0;
    for (const member of cluster.members) if (members.has(member)) intersection++;
    const score = intersection / Math.max(1, members.size + cluster.members.length - intersection);
    if (!best || score > best.score) best = { cluster, score };
  }
  return best;
}

function vectorSimilarity(left: readonly number[], right: readonly number[]): number {
  let distance = 0;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    distance += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return Math.max(0, 1 - distance / 2);
}

function ratioSimilarity(left: number, right: number): number {
  return Math.min(left, right) / Math.max(1e-6, left, right);
}

function differenceSimilarity(left: number, right: number): number {
  return Math.max(0, 1 - Math.abs(left - right));
}

function describeCluster(
  particles: ParticleStore,
  members: readonly number[],
  clusterRadiusUnits: number,
  roleByType: readonly number[],
): ParticleCluster {
  let centerX = 0;
  let centerY = 0;
  for (const index of members) {
    centerX += particles.x[index];
    centerY += particles.y[index];
  }
  centerX /= members.length;
  centerY /= members.length;
  const radiusSumByRole = new Float64Array(3);
  const countByRole = new Uint32Array(3);
  const countByType = new Uint32Array(6);
  let radiusSum = 0;
  let signedTangentSum = 0;
  let absoluteTangentSum = 0;
  let tangentWeight = 0;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  let neighborLinks = 0;
  for (const index of members) {
    const dx = particles.x[index] - centerX;
    const dy = particles.y[index] - centerY;
    const radius = Math.hypot(dx, dy);
    radiusSum += radius;
    covarianceXX += dx * dx;
    covarianceYY += dy * dy;
    covarianceXY += dx * dy;
    const role = roleByType[particles.type[index]];
    countByType[particles.type[index]]++;
    radiusSumByRole[role] += radius;
    countByRole[role]++;
    const speed = Math.hypot(particles.vx[index], particles.vy[index]);
    if (radius > 0 && speed > 0) {
      const tangent = (dx * particles.vy[index] - dy * particles.vx[index]) / (radius * speed);
      signedTangentSum += tangent;
      absoluteTangentSum += Math.abs(tangent);
      tangentWeight++;
    }
  }
  const neighborRadiusSquared = clusterRadiusUnits ** 2;
  for (let left = 0; left < members.length; left++) {
    for (let right = left + 1; right < members.length; right++) {
      const dx = particles.x[members[left]] - particles.x[members[right]];
      const dy = particles.y[members[left]] - particles.y[members[right]];
      if (dx * dx + dy * dy <= neighborRadiusSquared) neighborLinks += 2;
    }
  }
  const meanRadius = radiusSum / members.length;
  const hasEveryRole = countByRole.every((count) => count >= 2);
  const roleRadii = Array.from(
    radiusSumByRole,
    (sum, role) => sum / Math.max(1, countByRole[role]),
  );
  const outerSeparation = roleRadii[2] - roleRadii[0];
  const orderStrength = hasEveryRole
    ? Math.max(0, Math.min(1, outerSeparation / Math.max(1, meanRadius * 0.5)))
    : 0;
  const middleAlignment =
    outerSeparation > 0
      ? Math.max(
          0,
          1 - Math.abs(roleRadii[1] - (roleRadii[0] + roleRadii[2]) / 2) / outerSeparation,
        )
      : 0;
  const radialSeparation = orderStrength * (0.5 + middleAlignment * 0.5);
  const trace = covarianceXX + covarianceYY;
  const eigenDifference = Math.sqrt((covarianceXX - covarianceYY) ** 2 + 4 * covarianceXY ** 2);
  const largestEigenvalue = (trace + eigenDifference) / 2;
  const smallestEigenvalue = Math.max(0, (trace - eigenDifference) / 2);
  const shapeAnisotropy = largestEigenvalue === 0 ? 0 : 1 - smallestEigenvalue / largestEigenvalue;
  const densityCapacity = members.length * Math.min(6, Math.max(0, members.length - 1));
  const neighborDensity = densityCapacity === 0 ? 0 : Math.min(1, neighborLinks / densityCapacity);
  return {
    members,
    centerX,
    centerY,
    meanRadius,
    layering: Math.min(1, radialSeparation),
    radialLayering: measureRadialLayering(particles, members, centerX, centerY),
    orbitCoherence:
      tangentWeight === 0 ? 0 : Math.min(1, Math.abs(signedTangentSum / tangentWeight)),
    orbitActivity: tangentWeight === 0 ? 0 : Math.min(1, absoluteTangentSum / tangentWeight),
    compactness: Math.sqrt(Math.max(0, (1 - shapeAnisotropy) * neighborDensity)),
    shapeAnisotropy,
    neighborLinks,
    typeComposition: Array.from(countByType, (count) => count / members.length),
  };
}

function measureRadialLayering(
  particles: ParticleStore,
  members: readonly number[],
  centerX: number,
  centerY: number,
): number {
  if (members.length < 6) return 0;
  const radii = members
    .map((index) => Math.hypot(particles.x[index] - centerX, particles.y[index] - centerY))
    .sort((left, right) => left - right);
  const scale = Math.max(1, median(radii));
  const gaps = radii
    .slice(1)
    .map((radius, index) => radius - radii[index])
    .sort((left, right) => right - left);
  return Math.min(1, ((gaps[0] ?? 0) + (gaps[1] ?? 0) * 0.5) / (scale * 0.45));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function validateRoles(roleByType: readonly number[]): void {
  if (
    roleByType.length !== 6 ||
    roleByType.some((role) => !Number.isInteger(role) || role < 0 || role > 2)
  ) {
    throw new RangeError('Morfoloji rol eşlemesi altı türü 0, 1 veya 2 rolüne bağlamalı.');
  }
}

function find(parent: Int32Array, index: number): number {
  let root = index;
  while (parent[root] !== root) root = parent[root];
  while (parent[index] !== index) {
    const next = parent[index];
    parent[index] = root;
    index = next;
  }
  return root;
}

function union(parent: Int32Array, sizes: Uint32Array, left: number, right: number): void {
  let leftRoot = find(parent, left);
  let rightRoot = find(parent, right);
  if (leftRoot === rightRoot) return;
  if (sizes[leftRoot] < sizes[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
  parent[rightRoot] = leftRoot;
  sizes[leftRoot] += sizes[rightRoot];
}
