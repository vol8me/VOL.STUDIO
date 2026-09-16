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
  validateSafeInterior(config);
}

/**
 * Güvenli iç bölge (d ≥ fringe + yama yarıçapı) habitat alanının en az yarısı
 * olmalı (DESIGN §2, C7). Sınır MUHAFAZAKÂR bir alt sınırdır: iki yarıçap ayrı
 * ayrı `t` kadar küçültülür ve alan oranı (rx − t)(ry − t) / (rx·ry) ile
 * hesaplanır. Gerçek kontur bir superellipse olduğu için gerçek oran bundan
 * yüksektir — ölçüldü: varsayılan adayda analitik 0,561, gerçek maskede 0,592.
 * Bu kapı seeding araması yama yarıçapını büyüttüğünde (90 birimden itibaren)
 * örneği config düzeyinde reddeder.
 */
function validateSafeInterior(config: SubstrateConfig): void {
  const { width, height } = config.world.boundsUnits;
  const noise = 1 - config.habitat.noiseAmplitudeRatio;
  const radiusX = (width / 2) * config.habitat.radiusRatioX * noise;
  const radiusY = (height / 2) * config.habitat.radiusRatioY * noise;
  const offset = config.genome.fringe.widthUnits + config.genome.seeding.patchRadiusUnits;
  const innerX = radiusX - offset;
  const innerY = radiusY - offset;
  if (innerX <= 0 || innerY <= 0 || (innerX * innerY) / (radiusX * radiusY) < 0.5) {
    throw new RangeError(
      'Güvenli iç bölge habitat alanının yarısının altına iner: fringe + yama yarıçapı çok büyük (DESIGN §2).',
    );
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
