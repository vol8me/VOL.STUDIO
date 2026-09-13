import type { Rect } from '@volstudio/core/math/geometry';
import { PARTICLE_ROLE_COUNT, PARTICLE_TYPE_COUNT, type ParticleConfig } from '@/config/particles';
import type { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { SimRandom } from '@/runtime/sim/rng';

export function initializeParticles(
  particles: ParticleStore,
  random: SimRandom,
  config: ParticleConfig,
  bounds: Readonly<Rect>,
): void {
  const minX = bounds.x + config.radiusUnits;
  const maxX = bounds.x + bounds.width - config.radiusUnits;
  const minY = bounds.y + config.radiusUnits;
  const maxY = bounds.y + bounds.height - config.radiusUnits;
  if (minX > maxX || minY > maxY) {
    throw new RangeError('Dünya parçacık çapından küçük olamaz.');
  }
  for (let index = 0; index < particles.count; index++) {
    particles.x[index] = minX + random.next() * (maxX - minX);
    particles.y[index] = minY + random.next() * (maxY - minY);
    particles.vx[index] = random.bipolar() * config.initialSpeedUnitsPerReferenceTick;
    particles.vy[index] = random.bipolar() * config.initialSpeedUnitsPerReferenceTick;
    particles.type[index] = Math.floor(random.next() * PARTICLE_TYPE_COUNT);
  }
}

export function accumulateParticleForces(
  particles: ParticleStore,
  grid: ParticleSpatialHash,
  config: ParticleConfig,
): void {
  particles.forceX.fill(0);
  particles.forceY.fill(0);
  const rangeSquared = config.interactionRadiusUnits ** 2;
  for (let index = 0; index < particles.count; index++) {
    const x = particles.x[index];
    const y = particles.y[index];
    const cellX = Math.floor((x - grid.bounds.x) / grid.cellSize);
    const cellY = Math.floor((y - grid.bounds.y) / grid.cellSize);
    let forceX = 0;
    let forceY = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const cell = grid.cellIndex(cellX + offsetX, cellY + offsetY);
        if (cell === null) continue;
        for (let slot = grid.start(cell); slot < grid.end(cell); slot++) {
          const other = grid.particleAt(slot);
          if (other === index) continue;
          const dx = particles.x[other] - x;
          const dy = particles.y[other] - y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared <= 0 || distanceSquared >= rangeSquared) continue;
          const distance = Math.sqrt(distanceSquared);
          const magnitude = interactionMagnitude(
            distance,
            particles.type[index],
            particles.type[other],
            config,
          );
          forceX += (dx / distance) * magnitude;
          forceY += (dy / distance) * magnitude;
        }
      }
    }
    particles.forceX[index] = forceX;
    particles.forceY[index] = forceY;
  }
}

export function integrateParticles(
  particles: ParticleStore,
  config: ParticleConfig,
  bounds: Readonly<Rect>,
  stepMs: number,
): void {
  const stepScale = (stepMs * config.referenceHz) / 1000;
  if (!(stepScale > 0) || !Number.isFinite(stepScale)) {
    throw new RangeError(`Parçacık adımı pozitif ve sonlu olmalı: ${stepMs}`);
  }
  const friction = config.frictionPerReferenceTick ** stepScale;
  const maxSpeedSquared = config.maxSpeedUnitsPerReferenceTick ** 2;
  const minX = bounds.x + config.radiusUnits;
  const maxX = bounds.x + bounds.width - config.radiusUnits;
  const minY = bounds.y + config.radiusUnits;
  const maxY = bounds.y + bounds.height - config.radiusUnits;
  for (let index = 0; index < particles.count; index++) {
    let vx = (particles.vx[index] + particles.forceX[index] * stepScale) * friction;
    let vy = (particles.vy[index] + particles.forceY[index] * stepScale) * friction;
    const speedSquared = vx * vx + vy * vy;
    if (speedSquared > maxSpeedSquared) {
      const scale = config.maxSpeedUnitsPerReferenceTick / Math.sqrt(speedSquared);
      vx *= scale;
      vy *= scale;
    }
    const startX = particles.x[index];
    const startY = particles.y[index];
    let x = startX + vx * stepScale;
    let y = startY + vy * stepScale;
    if (x < minX) {
      const impactFraction = collisionFraction(startX, x, minX);
      vx = resolveWallVelocity(vx, config);
      x = minX + vx * stepScale * (1 - impactFraction);
      vy *= config.wallTangentRetention;
    } else if (x > maxX) {
      const impactFraction = collisionFraction(startX, x, maxX);
      vx = -resolveWallVelocity(-vx, config);
      x = maxX + vx * stepScale * (1 - impactFraction);
      vy *= config.wallTangentRetention;
    }
    if (y < minY) {
      const impactFraction = collisionFraction(startY, y, minY);
      vy = resolveWallVelocity(vy, config);
      y = minY + vy * stepScale * (1 - impactFraction);
      vx *= config.wallTangentRetention;
    } else if (y > maxY) {
      const impactFraction = collisionFraction(startY, y, maxY);
      vy = -resolveWallVelocity(-vy, config);
      y = maxY + vy * stepScale * (1 - impactFraction);
      vx *= config.wallTangentRetention;
    }
    x = Math.max(minX, Math.min(maxX, x));
    y = Math.max(minY, Math.min(maxY, y));
    particles.vx[index] = vx;
    particles.vy[index] = vy;
    particles.x[index] = x;
    particles.y[index] = y;
  }
}

function collisionFraction(start: number, end: number, plane: number): number {
  const delta = end - start;
  if (delta === 0) return 0;
  return Math.max(0, Math.min(1, (plane - start) / delta));
}

function resolveWallVelocity(inwardVelocity: number, config: ParticleConfig): number {
  if (inwardVelocity >= 0) return inwardVelocity;
  const impactSpeed = Math.abs(inwardVelocity);
  const restitution =
    impactSpeed >= config.wallHardImpactThresholdUnitsPerReferenceTick
      ? config.wallHardRestitution
      : config.wallSoftRestitution;
  return impactSpeed * restitution;
}

function interactionMagnitude(
  distance: number,
  ownType: number,
  otherType: number,
  config: ParticleConfig,
): number {
  if (distance < config.repulsionRadiusUnits) {
    return -config.repulsionStrength * (1 - distance / config.repulsionRadiusUnits);
  }
  const ownRole = config.roleByType[ownType];
  const otherRole = config.roleByType[otherType];
  const interactionRadius =
    config.interactionRadiusByRolePair[ownRole * PARTICLE_ROLE_COUNT + otherRole];
  if (distance >= interactionRadius) return 0;
  const span = interactionRadius - config.repulsionRadiusUnits;
  const phase = (distance - config.repulsionRadiusUnits) / span;
  const envelope = 1 - Math.abs(phase * 2 - 1);
  return (
    config.interactionMatrix[ownType * PARTICLE_TYPE_COUNT + otherType] *
    config.interactionStrength *
    envelope
  );
}
