import { PARTICLE_TYPE_COUNT, type ParticleConfig } from '@/config/particles';
import type { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { SimRandom } from '@/runtime/sim/rng';

export function initializeParticles(
  particles: ParticleStore,
  random: SimRandom,
  config: ParticleConfig,
): void {
  for (let index = 0; index < particles.count; index++) {
    particles.x[index] = random.next() * config.worldSizeUnits;
    particles.y[index] = random.next() * config.worldSizeUnits;
    particles.vx[index] = random.bipolar() * config.initialSpeedUnitsPerTick;
    particles.vy[index] = random.bipolar() * config.initialSpeedUnitsPerTick;
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
    const cellX = Math.floor(x / grid.cellSize);
    const cellY = Math.floor(y / grid.cellSize);
    let forceX = 0;
    let forceY = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const cell = grid.cellIndex(cellX + offsetX, cellY + offsetY);
        for (let slot = grid.start(cell); slot < grid.end(cell); slot++) {
          const other = grid.particleAt(slot);
          if (other === index) continue;
          const dx = toroidalDelta(particles.x[other] - x, config.worldSizeUnits);
          const dy = toroidalDelta(particles.y[other] - y, config.worldSizeUnits);
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

export function integrateParticles(particles: ParticleStore, config: ParticleConfig): void {
  const maxSpeedSquared = config.maxSpeedUnitsPerTick ** 2;
  for (let index = 0; index < particles.count; index++) {
    let vx = (particles.vx[index] + particles.forceX[index]) * config.friction;
    let vy = (particles.vy[index] + particles.forceY[index]) * config.friction;
    const speedSquared = vx * vx + vy * vy;
    if (speedSquared > maxSpeedSquared) {
      const scale = config.maxSpeedUnitsPerTick / Math.sqrt(speedSquared);
      vx *= scale;
      vy *= scale;
    }
    particles.vx[index] = vx;
    particles.vy[index] = vy;
    particles.x[index] = wrap(particles.x[index] + vx, config.worldSizeUnits);
    particles.y[index] = wrap(particles.y[index] + vy, config.worldSizeUnits);
  }
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
  const span = config.interactionRadiusUnits - config.repulsionRadiusUnits;
  const phase = (distance - config.repulsionRadiusUnits) / span;
  const envelope = 1 - Math.abs(phase * 2 - 1);
  return (
    config.interactionMatrix[ownType * PARTICLE_TYPE_COUNT + otherType] *
    config.interactionStrength *
    envelope
  );
}

function toroidalDelta(delta: number, size: number): number {
  return delta - Math.round(delta / size) * size;
}

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}
