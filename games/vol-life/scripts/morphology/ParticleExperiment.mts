import type { Rect } from '@volstudio/core/math/geometry';
import type { MorphologyAnalysisOptions } from '../../src/config/morphology';
import type { ParticleConfig } from '../../src/config/particles';
import {
  analyzeMorphologyFrame,
  compareClusterMembership,
  detectParticleClusters,
  type MorphologyFrameMetrics,
  type ParticleCluster,
} from '../../src/runtime/sim/MorphologyMetrics';
import {
  accumulateParticleForces,
  initializeParticles,
  integrateParticles,
} from '../../src/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '../../src/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '../../src/runtime/sim/ParticleStore';
import { createSimRandom } from '../../src/runtime/sim/rng';

export type WallModelVersion = 'legacy-spring-v1' | 'contact-impulse-v2';

export interface ParticleExperimentConfig {
  readonly seed: number;
  readonly bounds: Readonly<Rect>;
  readonly collisionBounds: Readonly<Rect>;
  readonly fixedStepMs: number;
  readonly particles: ParticleConfig;
  readonly analysis: MorphologyAnalysisOptions;
  readonly wallModel: WallModelVersion;
  readonly durationSeconds: number;
  readonly checkpointsSeconds: readonly number[];
  readonly temporalSampleEverySeconds?: number;
}

export interface ParticleExperimentCheckpoint extends MorphologyFrameMetrics {
  readonly seconds: number;
  readonly trajectoryAutocorrelation: number;
  readonly membershipStability: number;
}

export interface ParticleExperimentSummary {
  readonly movementPersistence: number;
  readonly wallDwellFraction: number;
  readonly membershipStability: number;
  readonly memberChurn: number;
  readonly orbitPersistence: number;
  readonly trajectoryAutocorrelation: number;
  readonly structuralDiversity: number;
  readonly meanClusterLifespanSeconds: number;
}

export interface ParticleExperimentResult {
  readonly seed: number;
  readonly checkpoints: readonly ParticleExperimentCheckpoint[];
  readonly summary: ParticleExperimentSummary;
}

export function runParticleExperiment(config: ParticleExperimentConfig): ParticleExperimentResult {
  validateExperiment(config);
  const store = new ParticleStore(config.particles.count);
  const random = createSimRandom(config.seed);
  initializeParticles(store, random, config.particles, config.collisionBounds);
  const grid = new ParticleSpatialHash(
    config.bounds,
    config.particles.cellSizeUnits,
    store.count,
  );
  const tickHz = 1000 / config.fixedStepMs;
  const totalTicks = Math.round(config.durationSeconds * tickHz);
  const sampleEveryTicks = Math.max(
    1,
    Math.round((config.temporalSampleEverySeconds ?? 1) * tickHz),
  );
  const checkpointTicks = new Set(
    config.checkpointsSeconds.map((seconds) => Math.round(seconds * tickHz)),
  );
  const temporal: TemporalSample[] = [];
  const checkpoints: ParticleExperimentCheckpoint[] = [];
  let previousVelocities: Float32Array | null = null;
  let previousStructures: readonly ParticleCluster[] = [];
  const wallStreaks = new Uint32Array(store.count);
  const maxWallStreaks = new Uint32Array(store.count);
  const clusterTracks = new Map<number, ClusterTrack>();
  let nextTrackId = 1;

  for (let tick = 1; tick <= totalTicks; tick++) {
    grid.rebuild(store);
    accumulateParticleForces(store, grid, config.particles);
    if (config.wallModel === 'legacy-spring-v1') {
      integrateLegacyWall(store, config.particles, config.collisionBounds, config.fixedStepMs);
    } else {
      integrateParticles(store, config.particles, config.collisionBounds, config.fixedStepMs);
    }
    if (tick % sampleEveryTicks !== 0 && !checkpointTicks.has(tick)) continue;

    const metrics = analyzeMorphologyFrame(
      store,
      config.bounds,
      config.particles,
      config.analysis,
      config.collisionBounds,
    );
    const structures = detectParticleClusters(
      store,
      config.bounds,
      config.particles.cellSizeUnits,
      config.analysis.clusterRadiusUnits,
      config.analysis.roleByType,
    ).filter((cluster) => cluster.members.length >= config.analysis.minimumClusterSize);
    const membershipStability = compareClusterMembership(previousStructures, structures);
    const trajectoryAutocorrelation = velocityAutocorrelation(previousVelocities, store);
    previousVelocities = interleavedVelocities(store);
    previousStructures = structures;
    updateWallStreaks(store, config, wallStreaks, maxWallStreaks);
    const sampleSeconds = config.temporalSampleEverySeconds ?? 1;
    nextTrackId = updateClusterTracks(
      structures,
      clusterTracks,
      nextTrackId,
      roundSeconds(tick / tickHz),
      sampleSeconds * 1.5,
    );
    const sample = {
      seconds: roundSeconds(tick / tickHz),
      metrics,
      trajectoryAutocorrelation,
      membershipStability,
    };
    temporal.push(sample);
    if (checkpointTicks.has(tick)) checkpoints.push({ ...metrics, ...sampleWithoutMetrics(sample) });
  }

  const sampleSeconds = config.temporalSampleEverySeconds ?? 1;
  return {
    seed: config.seed,
    checkpoints,
    summary: {
      movementPersistence: fraction(temporal, (sample) => sample.metrics.movingFraction >= 0.15),
      wallDwellFraction:
        mean(Array.from(maxWallStreaks)) * sampleSeconds / config.durationSeconds,
      membershipStability: mean(temporal.slice(1).map((sample) => sample.membershipStability)),
      memberChurn: 1 - mean(temporal.slice(1).map((sample) => sample.membershipStability)),
      orbitPersistence: longestRunFraction(
        temporal,
        (sample) =>
          sample.metrics.orbitActivity >= 0.4 && sample.metrics.orbitDominance >= 0.2,
      ),
      trajectoryAutocorrelation: mean(
        temporal.slice(1).map((sample) => sample.trajectoryAutocorrelation),
      ),
      structuralDiversity: structuralDiversity(temporal),
      meanClusterLifespanSeconds: mean(
        [...clusterTracks.values()].map((track) => track.lastSeconds - track.firstSeconds),
      ),
    },
  };
}

interface TemporalSample {
  readonly seconds: number;
  readonly metrics: MorphologyFrameMetrics;
  readonly trajectoryAutocorrelation: number;
  readonly membershipStability: number;
}

export interface ClusterTrack {
  readonly id: number;
  members: readonly number[];
  readonly firstSeconds: number;
  lastSeconds: number;
}

export function updateClusterTracks(
  structures: readonly ParticleCluster[],
  tracks: Map<number, ClusterTrack>,
  nextTrackId: number,
  seconds: number,
  maxGapSeconds: number = 1.5,
): number {
  const available = [...tracks.values()].filter(
    (track) => track.lastSeconds < seconds && seconds - track.lastSeconds <= maxGapSeconds,
  );
  const claimed = new Set<number>();
  for (const structure of structures) {
    let best: ClusterTrack | undefined;
    let bestScore = 0.35;
    for (const track of available) {
      if (claimed.has(track.id)) continue;
      const score = jaccard(track.members, structure.members);
      if (score > bestScore) {
        best = track;
        bestScore = score;
      }
    }
    if (best) {
      best.members = structure.members;
      best.lastSeconds = seconds;
      claimed.add(best.id);
    } else {
      tracks.set(nextTrackId, {
        id: nextTrackId,
        members: structure.members,
        firstSeconds: seconds,
        lastSeconds: seconds,
      });
      nextTrackId++;
    }
  }
  return nextTrackId;
}

function updateWallStreaks(
  particles: ParticleStore,
  config: ParticleExperimentConfig,
  streaks: Uint32Array,
  maximums: Uint32Array,
): void {
  const minX = config.collisionBounds.x + config.particles.radiusUnits;
  const maxX = config.collisionBounds.x + config.collisionBounds.width - config.particles.radiusUnits;
  const minY = config.collisionBounds.y + config.particles.radiusUnits;
  const maxY = config.collisionBounds.y + config.collisionBounds.height - config.particles.radiusUnits;
  for (let index = 0; index < particles.count; index++) {
    const distance = Math.min(
      particles.x[index] - minX,
      maxX - particles.x[index],
      particles.y[index] - minY,
      maxY - particles.y[index],
    );
    streaks[index] = distance <= config.analysis.wallContactDistanceUnits ? streaks[index] + 1 : 0;
    maximums[index] = Math.max(maximums[index], streaks[index]);
  }
}

function velocityAutocorrelation(previous: Float32Array | null, particles: ParticleStore): number {
  if (!previous) return 0;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < particles.count; index++) {
    const offset = index * 2;
    const oldSpeed = Math.hypot(previous[offset], previous[offset + 1]);
    const speed = Math.hypot(particles.vx[index], particles.vy[index]);
    if (oldSpeed <= 1e-6 || speed <= 1e-6) continue;
    sum +=
      (previous[offset] * particles.vx[index] + previous[offset + 1] * particles.vy[index]) /
      (oldSpeed * speed);
    count++;
  }
  return count === 0 ? 0 : sum / count;
}

function interleavedVelocities(particles: ParticleStore): Float32Array {
  const values = new Float32Array(particles.count * 2);
  for (let index = 0; index < particles.count; index++) {
    values[index * 2] = particles.vx[index];
    values[index * 2 + 1] = particles.vy[index];
  }
  return values;
}

function structuralDiversity(samples: readonly TemporalSample[]): number {
  if (samples.length < 2) return 0;
  return mean(
    samples.slice(1).map((sample, index) => {
      const before = samples[index].metrics;
      const after = sample.metrics;
      return Math.min(
        1,
        mean([
          Math.abs(after.clusteredFraction - before.clusteredFraction) * 3,
          Math.abs(after.meanCompactness - before.meanCompactness) * 3,
          Math.abs(after.meanRadialLayering - before.meanRadialLayering) * 2,
          Math.abs(after.meanShapeAnisotropy - before.meanShapeAnisotropy) * 2,
          Math.abs(after.fragmentation - before.fragmentation) * 3,
        ]),
      );
    }),
  );
}

function integrateLegacyWall(
  particles: ParticleStore,
  config: ParticleConfig,
  bounds: Readonly<Rect>,
  stepMs: number,
): void {
  const stepScale = (stepMs * config.referenceHz) / 1000;
  const friction = config.frictionPerReferenceTick ** stepScale;
  const minX = bounds.x + config.radiusUnits;
  const maxX = bounds.x + bounds.width - config.radiusUnits;
  const minY = bounds.y + config.radiusUnits;
  const maxY = bounds.y + bounds.height - config.radiusUnits;
  for (let index = 0; index < particles.count; index++) {
    const wallX = legacyContact(particles.x[index] - minX) - legacyContact(maxX - particles.x[index]);
    const wallY = legacyContact(particles.y[index] - minY) - legacyContact(maxY - particles.y[index]);
    let vx = (particles.vx[index] + (particles.forceX[index] + wallX) * stepScale) * friction;
    let vy = (particles.vy[index] + (particles.forceY[index] + wallY) * stepScale) * friction;
    const speed = Math.hypot(vx, vy);
    if (speed > config.maxSpeedUnitsPerReferenceTick) {
      const scale = config.maxSpeedUnitsPerReferenceTick / speed;
      vx *= scale;
      vy *= scale;
    }
    let x = particles.x[index] + vx * stepScale;
    let y = particles.y[index] + vy * stepScale;
    if (x < minX || x > maxX) {
      x = Math.max(minX, Math.min(maxX, x));
      vx = -vx * (Math.abs(vx) >= 0.8 ? 0.55 : 0.28);
      vy *= 0.995;
    }
    if (y < minY || y > maxY) {
      y = Math.max(minY, Math.min(maxY, y));
      vy = -vy * (Math.abs(vy) >= 0.8 ? 0.55 : 0.28);
      vx *= 0.995;
    }
    particles.x[index] = x;
    particles.y[index] = y;
    particles.vx[index] = vx;
    particles.vy[index] = vy;
  }
}

function legacyContact(distance: number): number {
  if (distance >= 12) return 0;
  const penetration = Math.max(0, 1 - Math.max(0, distance) / 12);
  return 0.24 * penetration * penetration;
}

function sampleWithoutMetrics(sample: TemporalSample) {
  return {
    seconds: sample.seconds,
    trajectoryAutocorrelation: sample.trajectoryAutocorrelation,
    membershipStability: sample.membershipStability,
  };
}

function longestRunFraction<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest / Math.max(1, values.length);
}

function fraction<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length / Math.max(1, values.length);
}

function jaccard(left: readonly number[], right: readonly number[]): number {
  const members = new Set(left);
  let intersection = 0;
  for (const member of right) if (members.has(member)) intersection++;
  return intersection / Math.max(1, members.size + right.length - intersection);
}

function validateExperiment(config: ParticleExperimentConfig): void {
  if (!(config.durationSeconds > 0) || !Number.isFinite(config.durationSeconds)) {
    throw new RangeError('Deney süresi pozitif ve sonlu olmalı.');
  }
  if (
    config.checkpointsSeconds.some(
      (seconds) => !(seconds > 0) || seconds > config.durationSeconds || !Number.isFinite(seconds),
    )
  ) {
    throw new RangeError('Deney checkpointleri süre aralığında olmalı.');
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(6));
}
