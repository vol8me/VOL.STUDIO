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
  readonly orbitCoherence: number;
}

export interface MorphologyFrameMetrics {
  readonly clusteredFraction: number;
  readonly clusterCount: number;
  readonly largestClusterShare: number;
  readonly meanLayering: number;
  readonly meanSpeed: number;
  readonly movingFraction: number;
  readonly staticFraction: number;
  readonly fragmentation: number;
  readonly collapse: number;
  readonly orbitDominance: number;
}

import type { MorphologyAnalysisOptions } from '@/config/morphology';
export type { MorphologyAnalysisOptions };

export function detectParticleClusters(
  particles: ParticleStore,
  bounds: Readonly<Rect>,
  cellSizeUnits: number,
  clusterRadiusUnits: number,
): ParticleCluster[] {
  if (!(clusterRadiusUnits > 0) || clusterRadiusUnits > cellSizeUnits) {
    throw new RangeError('Küme yarıçapı pozitif ve spatial hash hücresinden büyük olmamalı.');
  }
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
  return [...groups.values()].map((members) => describeCluster(particles, members));
}

export function analyzeMorphologyFrame(
  particles: ParticleStore,
  bounds: Readonly<Rect>,
  config: ParticleConfig,
  options: MorphologyAnalysisOptions,
): MorphologyFrameMetrics {
  const clusters = detectParticleClusters(
    particles,
    bounds,
    config.cellSizeUnits,
    options.clusterRadiusUnits,
  );
  const structures = clusters.filter(
    (cluster) => cluster.members.length >= options.minimumClusterSize,
  );
  const structuredParticles = structures.reduce((sum, cluster) => sum + cluster.members.length, 0);
  const largest = structures.reduce((size, cluster) => Math.max(size, cluster.members.length), 0);
  let speedSum = 0;
  let moving = 0;
  for (let index = 0; index < particles.count; index++) {
    const speed = Math.hypot(particles.vx[index], particles.vy[index]);
    speedSum += speed;
    if (speed >= options.movingSpeedUnitsPerReferenceTick) moving++;
  }
  const orbitParticles = structures.reduce(
    (sum, cluster) => sum + cluster.orbitCoherence * cluster.members.length,
    0,
  );
  return {
    clusteredFraction: structuredParticles / particles.count,
    clusterCount: structures.length,
    largestClusterShare: largest / particles.count,
    meanLayering:
      structuredParticles === 0
        ? 0
        : structures.reduce((sum, cluster) => sum + cluster.layering * cluster.members.length, 0) /
          structuredParticles,
    meanSpeed: speedSum / particles.count,
    movingFraction: moving / particles.count,
    staticFraction: 1 - moving / particles.count,
    fragmentation: Math.min(
      1,
      structures.length / Math.max(1, particles.count / options.minimumClusterSize),
    ),
    collapse: Math.max(0, (largest / particles.count - 0.82) / 0.18),
    orbitDominance: orbitParticles / particles.count,
  };
}

function describeCluster(particles: ParticleStore, members: readonly number[]): ParticleCluster {
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
  let radiusSum = 0;
  let signedTangentSum = 0;
  let tangentWeight = 0;
  for (const index of members) {
    const dx = particles.x[index] - centerX;
    const dy = particles.y[index] - centerY;
    const radius = Math.hypot(dx, dy);
    radiusSum += radius;
    const role = Math.floor(particles.type[index] / 2);
    radiusSumByRole[role] += radius;
    countByRole[role]++;
    const speed = Math.hypot(particles.vx[index], particles.vy[index]);
    if (radius > 0 && speed > 0) {
      signedTangentSum += (dx * particles.vy[index] - dy * particles.vx[index]) / (radius * speed);
      tangentWeight++;
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
  return {
    members,
    centerX,
    centerY,
    meanRadius,
    layering: Math.min(1, radialSeparation),
    orbitCoherence:
      tangentWeight === 0 ? 0 : Math.min(1, Math.abs(signedTangentSum / tangentWeight)),
  };
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
