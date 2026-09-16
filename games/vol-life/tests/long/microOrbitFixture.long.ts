import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import type { PairForceKernel } from '@/runtime/sim/PairForceKernel';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';
import {
  defaultMicroOrbitConfig,
  measureMicroOrbits,
  type ClusterWindow,
  type MemberTrack,
} from '../../scripts/morphology/microOrbit';

/*
 * E8: GERÇEK `LifeWorld` fiziğiyle üç parçacık orbit fixture'ı.
 *
 * Uzun testte durur çünkü 15 simüle dakika (54.000 tick) ÖLÇÜLDÜ: 29,7 saniye
 * sürüyor, birim kapısının 5 saniyelik sınırının çok üstünde. Madde bu durumda
 * `test:long`'a taşımayı söylüyor; timeout BÜYÜTÜLMEDİ.
 *
 * Fixture'ın gerçekten orbit olduğuna KURULUŞA GÜVENEREK karar verilmez:
 * yarıçap kararlılığı ve tur periyodu ayrıca ölçülür.
 */
const CENTER = { x: 512, y: 512 };
const STRENGTH = 0.01;
const CUTOFF = 96;
const RADIUS = 40;
/** 15 simüle dakika: 60 Hz × 900 sn. */
const TICKS = 54_000;
const SAMPLE_INTERVAL = 60;

/**
 * Sabit büyüklüklü çekim; yörünge merkezcil kuvvetle kurulur. Üretim kerneli
 * çok bantlıdır ve bu fixture'ın sorusu kernel şekli değil, harness hattının
 * kapalı yörüngeyi tanıyıp tanımadığıdır — bu yüzden `options.kernel` ile
 * enjekte edilir (DESIGN §8).
 */
function attractionKernel(): PairForceKernel {
  return {
    cutoffUnits: CUTOFF,
    magnitude: (distance) => (distance > 0 && distance < CUTOFF ? STRENGTH : 0),
  };
}

/**
 * Üç parçacık eşkenar üçgende: her biri diğer ikisinden sabit F görür, bileşke
 * merkeze doğru F·√3'tür. Denge hızı v = √(F·√3·r) — ölçüldü: bu hızda yarıçap
 * değişim katsayısı 0,004, ±%10 sapmada 0,049.
 */
function equilibriumSpeed(radius: number): number {
  return Math.sqrt(STRENGTH * Math.sqrt(3) * radius);
}

function orbitWorld(speedScale = 1): LifeWorld {
  const config = {
    ...substrateConfig,
    candidate: {
      ...substrateConfig.candidate,
      physics: {
        ...substrateConfig.candidate.physics,
        dynamics: {
          ...substrateConfig.candidate.physics.dynamics,
          // Sönümleme 1: ölçüldü, 0,93'te üç parçacık merkeze çöküyor (yarıçap 0,81).
          dampingPerReferenceTick: 1,
          forceScale: 1,
        },
      },
    },
  };
  const world = new LifeWorld(config, createExplicitWorldMetadata(4242), {
    kernel: attractionKernel(),
  });
  for (let slot = 0; slot < world.particles.capacity; slot++) world.particles.deactivateSlot(slot);
  const speed = equilibriumSpeed(RADIUS) * speedScale;
  for (let index = 0; index < 3; index++) {
    const angle = (index / 3) * Math.PI * 2;
    world.particles.activateSlot(
      CENTER.x + Math.cos(angle) * RADIUS,
      CENTER.y + Math.sin(angle) * RADIUS,
      -Math.sin(angle) * speed,
      Math.cos(angle) * speed,
      0,
    );
  }
  return world;
}

interface OrbitRun {
  readonly window: ClusterWindow;
  readonly radii: number[];
  readonly aliveAtEnd: number;
}

function simulate(world: LifeWorld, ticks: number): OrbitRun {
  const tracks = new Map<number, { x: number; y: number }[]>();
  const radii: number[] = [];
  let startMembers: number[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    world.step();
    if (tick % SAMPLE_INTERVAL !== 0) continue;
    const members: number[] = [];
    let radiusSum = 0;
    for (let slot = 0; slot < world.particles.capacity; slot++) {
      if (world.particles.active[slot] === 0) continue;
      const id = world.particles.stableId[slot];
      members.push(id);
      const point = { x: world.particles.x[slot], y: world.particles.y[slot] };
      const path = tracks.get(id) ?? [];
      path.push(point);
      tracks.set(id, path);
      radiusSum += Math.hypot(point.x - CENTER.x, point.y - CENTER.y);
    }
    if (members.length > 0) radii.push(radiusSum / members.length);
    if (startMembers.length === 0) startMembers = members;
  }
  const endMembers = [...tracks.keys()];
  const memberTracks: MemberTrack[] = [...tracks.entries()].map(([id, positions]) => ({
    id,
    positions,
  }));
  return {
    window: {
      clusterId: 1,
      ageTicks: ticks,
      tracks: memberTracks,
      membersAtStart: startMembers,
      membersAtEnd: endMembers,
    },
    radii,
    aliveAtEnd: world.particles.activeCount,
  };
}

function variationCoefficient(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  if (mean === 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return Math.sqrt(variance) / mean;
}

describe('E8 — gerçek fizikle üç parçacık orbit fixture’ı', () => {
  it('15 simüle dakika boyunca kararlı döner ve micro-orbit olarak işaretlenir', () => {
    const run = simulate(orbitWorld(), TICKS);

    // 1) Fixture gerçekten orbit mi: yarıçap kararlılığı AYRICA ölçülür.
    expect(run.aliveAtEnd).toBe(3);
    expect(variationCoefficient(run.radii)).toBeLessThan(0.05);
    expect(run.radii[run.radii.length - 1]).toBeGreaterThan(RADIUS * 0.8);

    // 2) Dedektör onu kötü döngü olarak tanır.
    const report = measureMicroOrbits([run.window], run.aliveAtEnd);
    const sample = report.samples[0];

    expect(sample.turns).toBeGreaterThanOrEqual(defaultMicroOrbitConfig.minTurns);
    expect(sample.angularCoherence).toBeGreaterThanOrEqual(
      defaultMicroOrbitConfig.minAngularCoherence,
    );
    expect(sample.radiusVariation).toBeLessThanOrEqual(defaultMicroOrbitConfig.maxRadiusVariation);
    expect(sample.membershipExchangeRate).toBe(0);
    expect(sample.isMicroOrbit).toBe(true);
    expect(report.persistentMicroOrbitFraction).toBe(1);
  });

  /* NEGATİF 1: gerçek fizikte rastgele itilen üç parçacık işaretlenmez. */
  it('rastgele itilen üç parçacık micro-orbit sayılmaz', () => {
    const world = orbitWorld();
    let seed = 99;
    const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let slot = 0; slot < world.particles.capacity; slot++) {
      if (world.particles.active[slot] === 0) continue;
      const angle = random() * Math.PI * 2;
      world.particles.vx[slot] = Math.cos(angle) * 1.5;
      world.particles.vy[slot] = Math.sin(angle) * 1.5;
    }

    const run = simulate(world, 6_000);
    const sample = measureMicroOrbits([run.window], Math.max(1, run.aliveAtEnd)).samples[0];

    expect(sample.isMicroOrbit).toBe(false);
  });

  /* NEGATİF 2: büyük, deforme olan, üye değiştiren kinematik dönüş işaretlenmez. */
  it('50 parçacıklı deforme kinematik dönüş micro-orbit sayılmaz', () => {
    const steps = 30;
    const ids = Array.from({ length: 50 }, (_, index) => index + 1);
    const window: ClusterWindow = {
      clusterId: 2,
      ageTicks: TICKS,
      membersAtStart: ids,
      membersAtEnd: [...ids.slice(25), ...Array.from({ length: 25 }, (_, index) => 1000 + index)],
      tracks: ids.map((id, index) => ({
        id,
        positions: Array.from({ length: steps }, (_, step) => {
          const phase = (step / (steps - 1)) * Math.PI * 2 + index;
          const radius = 60 + step * 3 + (index % 5) * 8;
          return {
            x: CENTER.x + step * 5 + Math.cos(phase) * radius,
            y: CENTER.y + Math.sin(phase) * radius,
          };
        }),
      })),
    };

    const sample = measureMicroOrbits([window], 50).samples[0];

    expect(sample.size).toBeGreaterThan(defaultMicroOrbitConfig.maxClusterSize);
    expect(sample.isMicroOrbit).toBe(false);
  });
});
