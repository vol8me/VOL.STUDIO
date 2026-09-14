import {
  clonePhysicsGenome,
  defaultPhysicsGenome,
  digestString,
  serializePhysicsGenome,
  validatePhysicsGenome,
  type PhysicsGenome,
} from './genome';
import {
  cloneHabitatConfig,
  habitatConfig,
  validateHabitatConfig,
  type HabitatConfig,
} from './habitat';
import {
  cloneParticleConfig,
  particleConfig,
  validateParticleConfig,
  type ParticleConfig,
} from './particles';
import { cloneWorldConfig, validateWorldConfig, worldConfig, type WorldConfig } from './world';

/** Fizik ve habitat sözleşmesinin bütünü; snapshot fingerprint'i buradan türer. */
export interface SubstrateConfig {
  readonly world: WorldConfig;
  readonly particles: ParticleConfig;
  readonly genome: PhysicsGenome;
  readonly habitat: HabitatConfig;
}

export const substrateConfig: SubstrateConfig = {
  world: worldConfig,
  particles: particleConfig,
  genome: defaultPhysicsGenome,
  habitat: habitatConfig,
};

export function cloneSubstrateConfig(config: SubstrateConfig): SubstrateConfig {
  return {
    world: cloneWorldConfig(config.world),
    particles: cloneParticleConfig(config.particles),
    genome: clonePhysicsGenome(config.genome),
    habitat: cloneHabitatConfig(config.habitat),
  };
}

export function validateSubstrateConfig(config: SubstrateConfig): void {
  validateWorldConfig(config.world);
  validateParticleConfig(config.particles);
  validatePhysicsGenome(config.genome, config.particles.radiusUnits);
  validateHabitatConfig(config.habitat);
  validateStorageGeometry(config);
  if (config.genome.cutoffUnits > config.particles.cellSizeUnits) {
    throw new RangeError('Kernel menzili spatial-hash hücresini aşamaz.');
  }
  const { width, height } = config.world.boundsUnits;
  const minHalfRadius =
    Math.min(width * config.habitat.radiusRatioX, height * config.habitat.radiusRatioY) / 2;
  const noiseReach = minHalfRadius * (1 + config.habitat.noiseAmplitudeRatio);
  if (noiseReach + config.habitat.storageMarginUnits > Math.min(width, height) / 2) {
    throw new RangeError('Habitat konturu depolama kenar boşluğunu ihlal ediyor.');
  }
  if (
    config.genome.fringe.widthUnits * 4 >
    minHalfRadius * (1 - config.habitat.noiseAmplitudeRatio)
  ) {
    throw new RangeError('Void fringe habitatın merkezine ulaşacak kadar geniş (DESIGN §2).');
  }
  if (config.genome.seeding.patchRadiusUnits * 2 > minHalfRadius) {
    throw new RangeError('Origin yaması habitatın yarısından büyük olamaz.');
  }
}

function validateStorageGeometry(config: SubstrateConfig): void {
  const { boundsUnits } = config.world;
  const cell = config.particles.cellSizeUnits;
  if (
    !Number.isFinite(boundsUnits.x) ||
    !Number.isFinite(boundsUnits.y) ||
    !(boundsUnits.width > 0) ||
    !Number.isFinite(boundsUnits.width) ||
    !(boundsUnits.height > 0) ||
    !Number.isFinite(boundsUnits.height)
  ) {
    throw new RangeError('Depolama sınırları sonlu ve pozitif olmalı.');
  }
  const cellsX = boundsUnits.width / cell;
  const cellsY = boundsUnits.height / cell;
  if (!Number.isInteger(cellsX) || !Number.isInteger(cellsY) || cellsX < 3 || cellsY < 3) {
    throw new RangeError('Depolama boyutları spatial-hash hücresine tam bölünmeli (en az 3×3).');
  }
}

export function fingerprintSubstrateConfig(config: SubstrateConfig): string {
  validateSubstrateConfig(config);
  const serialized = JSON.stringify({
    world: config.world,
    particles: config.particles,
    genome: serializePhysicsGenome(config.genome),
    habitat: config.habitat,
  });
  return `life-world-v3-${digestString(serialized)}`;
}
