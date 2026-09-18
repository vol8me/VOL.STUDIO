import type { DynamicsGenes } from '@/config/genome';
import type { PairForceKernel } from '@/runtime/sim/PairForceKernel';
import type { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

/**
 * Aktif çiftlerin kuvvetini toplar; hash yalnız aktif slot taşıdığı için pasif çift oluşmaz.
 * Çoklu parçacık sıkışmasında hacim dışlama gradyanı eklenerek kitle çökmesi engellenir.
 */
export function accumulateParticleForces(
  particles: ParticleStore,
  grid: ParticleSpatialHash,
  kernel: PairForceKernel,
  forceScale: number,
  exclusionRadiusUnits = 0,
  exclusionStrength = 0,
  contactRadiusUnits = 0,
  contactStrength = 0,
): void {
  if (!(forceScale > 0) || !Number.isFinite(forceScale)) {
    throw new RangeError(`Kuvvet ölçeği pozitif ve sonlu olmalı: ${forceScale}`);
  }
  if (kernel.cutoffUnits > grid.cellSize) {
    throw new RangeError('Kernel menzili hücre boyutunu aşıyor; 3×3 komşuluk çift kaçırır.');
  }
  particles.forceX.fill(0);
  particles.forceY.fill(0);
  const { active, x, y, type, forceX, forceY, capacity } = particles;
  const rangeSquared = kernel.cutoffUnits ** 2;
  for (let index = 0; index < capacity; index++) {
    if (active[index] === 0) continue;
    const ownX = x[index];
    const ownY = y[index];
    const ownType = type[index];
    const cellX = Math.floor((ownX - grid.bounds.x) / grid.cellSize);
    const cellY = Math.floor((ownY - grid.bounds.y) / grid.cellSize);
    let sumX = 0;
    let sumY = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const cell = grid.cellIndex(cellX + offsetX, cellY + offsetY);
        if (cell === null) continue;
        for (let slot = grid.start(cell), end = grid.end(cell); slot < end; slot++) {
          const other = grid.particleAt(slot);
          if (other === index) continue;
          const dx = x[other] - ownX;
          const dy = y[other] - ownY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= rangeSquared) continue;
          let diffX = dx;
          let diffY = dy;
          let distSq = distanceSquared;
          if (distSq === 0) {
            diffX = index > other ? 1e-4 : -1e-4;
            diffY = 0;
            distSq = 1e-8;
          }
          const distance = Math.sqrt(distSq);
          let magnitude = kernel.magnitude(distance, ownType, type[other]) * forceScale;
          if (exclusionStrength > 0 && distance < exclusionRadiusUnits) {
            const overlap = (exclusionRadiusUnits - distance) / exclusionRadiusUnits;
            magnitude -= exclusionStrength * (overlap * overlap) * forceScale;
          }
          if (contactStrength > 0 && distance < contactRadiusUnits) {
            const d = Math.max(distance, contactRadiusUnits * 0.1);
            const contactOverlap = (contactRadiusUnits / d) ** 2 - 1;
            magnitude -= contactStrength * contactOverlap * forceScale;
          }
          sumX += (diffX / distance) * magnitude;
          sumY += (diffY / distance) * magnitude;
        }
      }
    }
    forceX[index] = sumX;
    forceY[index] = sumY;
  }
}

/**
 * Sönümleme, hız zarfı ve konum güncellemesi. Duvar, clamp ve sekme YOKTUR;
 * kıyıyı geçen parçacığı `VoidSink` düşürür (DESIGN.md §2).
 */
export function integrateParticles(
  particles: ParticleStore,
  dynamics: DynamicsGenes,
  referenceHz: number,
  stepMs: number,
): void {
  const stepScale = (stepMs * referenceHz) / 1000;
  if (!(stepScale > 0) || !Number.isFinite(stepScale)) {
    throw new RangeError(`Parçacık adımı pozitif ve sonlu olmalı: ${stepMs}`);
  }
  const damping = dynamics.dampingPerReferenceTick ** stepScale;
  const maxSpeed = dynamics.maxSpeedUnitsPerReferenceTick;
  const maxSpeedSquared = maxSpeed ** 2;
  const { active, x, y, vx, vy, forceX, forceY, capacity } = particles;
  for (let index = 0; index < capacity; index++) {
    if (active[index] === 0) continue;
    let velocityX = (vx[index] + forceX[index] * stepScale) * damping;
    let velocityY = (vy[index] + forceY[index] * stepScale) * damping;
    const speedSquared = velocityX * velocityX + velocityY * velocityY;
    if (speedSquared > maxSpeedSquared) {
      const scale = maxSpeed / Math.sqrt(speedSquared);
      velocityX *= scale;
      velocityY *= scale;
    }
    vx[index] = velocityX;
    vy[index] = velocityY;
    x[index] += velocityX * stepScale;
    y[index] += velocityY * stepScale;
  }
}
