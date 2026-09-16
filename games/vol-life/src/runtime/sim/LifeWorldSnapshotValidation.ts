import { PARTICLE_TYPE_COUNT } from '@/config/genome';
import type { SubstrateConfig } from '@/config/substrate';
import { FIELD_NAMES } from '@/runtime/sim/FieldSet';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { validateMatterReservoirSnapshot } from '@/runtime/sim/MatterReservoir';
import { validateParticleSnapshot } from '@/runtime/sim/ParticleStore';
import { validateRandomStreamStates } from '@/runtime/sim/RandomStreams';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';
import { validateWorldMetadata } from '@/runtime/sim/WorldMetadata';

/**
 * Snapshot'ı canlı state'e dokunmadan bütünüyle doğrular. Domain verilirse
 * habitat digest'i ve aktif parçacıkların kıyının gerisinde olduğu da sınanır.
 */
export function validateLifeWorldSnapshot(
  snapshot: LifeWorldSnapshot,
  config: SubstrateConfig,
  domain: WorldDomain | null = null,
): void {
  validateWorldMetadata(snapshot.metadata);
  const { world, particles: particleConfig, candidate } = config;
  const fieldLength = world.fieldResolution ** 2;
  const fieldsValid =
    snapshot.nutrientDiffusionSource.length === fieldLength &&
    snapshot.nutrientDiffusionSource.every(Number.isFinite) &&
    FIELD_NAMES.every(
      (name) =>
        snapshot.fields[name].length === fieldLength &&
        snapshot.fields[name].every(Number.isFinite),
    );
  if (!fieldsValid) {
    throw new RangeError('Dünya kaydının alanları yapılandırmayla uyuşmuyor.');
  }
  if (
    !Number.isSafeInteger(snapshot.tick) ||
    snapshot.tick < 0 ||
    !Number.isInteger(snapshot.nextFieldBand) ||
    snapshot.nextFieldBand < 0 ||
    snapshot.nextFieldBand >= world.fieldUpdateBands
  ) {
    throw new RangeError('Dünya kaydının zaman bilgisi geçersiz.');
  }
  validateRandomStreamStates(snapshot.randomStreamStates);
  if (
    typeof snapshot.habitatDigest !== 'string' ||
    !/^[0-9a-f]{16}$/.test(snapshot.habitatDigest)
  ) {
    throw new RangeError('Dünya kaydının habitat digest’i geçersiz.');
  }
  if (domain && snapshot.habitatDigest !== domain.digest) {
    throw new RangeError('Dünya kaydı başka bir habitat konturuna ait.');
  }
  validateMatterReservoirSnapshot(snapshot.reservoir);
  validateParticleSnapshot(snapshot.particles, particleConfig.capacity);
  const { particles } = snapshot;
  const maxSpeedSquared = (candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick + 1e-5) ** 2;
  const storage = world.boundsUnits;
  const sample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };
  for (let slot = 0; slot < particleConfig.capacity; slot++) {
    if (particles.active[slot] === 0) continue;
    const x = particles.x[slot];
    const y = particles.y[slot];
    const insideStorage =
      x >= storage.x &&
      x < storage.x + storage.width &&
      y >= storage.y &&
      y < storage.y + storage.height;
    const insideHabitat = domain
      ? domain.sampleDistanceAndNormal(x, y, sample).distance >= 0
      : true;
    if (
      !insideStorage ||
      !insideHabitat ||
      particles.vx[slot] ** 2 + particles.vy[slot] ** 2 > maxSpeedSquared ||
      particles.type[slot] >= PARTICLE_TYPE_COUNT
    ) {
      throw new RangeError(`Dünya kaydındaki ${slot}. parçacık geçersiz.`);
    }
  }
}
