import { PARTICLE_TYPE_COUNT, type ParticleConfig } from '@/config/particles';
import type { WorldConfig } from '@/config/world';
import type { LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import { FIELD_NAMES } from '@/runtime/sim/FieldSet';
import { resolveParticleBounds } from '@/runtime/sim/WorldBounds';
import { validateWorldMetadata } from '@/runtime/sim/WorldMetadata';

export function validateLifeWorldSnapshot(
  snapshot: LifeWorldSnapshot,
  worldConfig: WorldConfig,
  particleConfig: ParticleConfig,
): void {
  validateWorldMetadata(snapshot.metadata);
  const fieldLength = worldConfig.fieldResolution ** 2;
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
    !Number.isInteger(snapshot.rngState) ||
    snapshot.rngState < -0x80000000 ||
    snapshot.rngState > 0x7fffffff ||
    !Number.isInteger(snapshot.nextFieldBand) ||
    snapshot.nextFieldBand < 0 ||
    snapshot.nextFieldBand >= worldConfig.fieldUpdateBands
  ) {
    throw new RangeError('Dünya kaydının zaman veya rastgelelik bilgisi geçersiz.');
  }
  const { particles } = snapshot;
  const particleArraysValid =
    particles.x.length === particleConfig.count &&
    particles.y.length === particleConfig.count &&
    particles.vx.length === particleConfig.count &&
    particles.vy.length === particleConfig.count &&
    particles.type.length === particleConfig.count;
  if (!particleArraysValid) {
    throw new RangeError('Dünya kaydının parçacık sayısı yapılandırmayla uyuşmuyor.');
  }
  const bounds = resolveParticleBounds(
    worldConfig.boundsUnits,
    worldConfig.particleCollisionInsetUnits,
  );
  const minX = bounds.x + particleConfig.radiusUnits;
  const maxX = bounds.x + bounds.width - particleConfig.radiusUnits;
  const minY = bounds.y + particleConfig.radiusUnits;
  const maxY = bounds.y + bounds.height - particleConfig.radiusUnits;
  const maxSpeedSquared = (particleConfig.maxSpeedUnitsPerReferenceTick + 1e-5) ** 2;
  for (let index = 0; index < particles.x.length; index++) {
    const x = particles.x[index];
    const y = particles.y[index];
    const vx = particles.vx[index];
    const vy = particles.vy[index];
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(vx) ||
      !Number.isFinite(vy) ||
      x < minX ||
      x > maxX ||
      y < minY ||
      y > maxY ||
      vx * vx + vy * vy > maxSpeedSquared ||
      particles.type[index] >= PARTICLE_TYPE_COUNT
    ) {
      throw new RangeError(`Dünya kaydındaki ${index}. parçacık geçersiz.`);
    }
  }
}
