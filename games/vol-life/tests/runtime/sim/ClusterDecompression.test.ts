import { describe, expect, it } from 'vitest';
import { defaultSubstrateCandidate } from '@/config/candidate';
import { particleConfig } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';
import { createMultiBandKernel } from '@/runtime/sim/PairForceKernel';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { accumulateParticleForces, integrateParticles } from '@/runtime/sim/ParticlePhysics';

describe('ClusterDecompression: küme içi sıkışma ve temas ayrışması', () => {
  const bounds = substrateConfig.world.boundsUnits;
  const dynamics = defaultSubstrateCandidate.physics.dynamics;
  const kernel = createMultiBandKernel(defaultSubstrateCandidate.physics);

  it('aşırı sıkışık başlayan parçacıklar temas bariyeriyle dışa genişler ve iç içe kalmaz', () => {
    const count = 8;
    const particles = new ParticleStore(count);
    const centerX = 500;
    const centerY = 500;
    const initialRadius = 4.0; // r=4.5 iken 4.0 aşırı sıkışık, iç içe geçmiş durumdur

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * initialRadius;
      const y = centerY + Math.sin(angle) * initialRadius;
      particles.activateSlot(x, y, 0, 0, i % 6);
    }

    const grid = new ParticleSpatialHash(bounds, particleConfig.cellSizeUnits, count);

    // Başlangıçtaki en küçük çiftler arası mesafe
    let initialMinDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const d = Math.hypot(particles.x[j] - particles.x[i], particles.y[j] - particles.y[i]);
        initialMinDist = Math.min(initialMinDist, d);
      }
    }
    expect(initialMinDist).toBeLessThan(7.0);

    // 20 fizik adımı çalıştır
    for (let step = 0; step < 20; step++) {
      grid.rebuild(particles);
      accumulateParticleForces(
        particles,
        grid,
        kernel,
        dynamics.forceScale,
        particleConfig.exclusionRadiusUnits,
        particleConfig.exclusionStrength,
        particleConfig.radiusUnits * 2,
        particleConfig.contactStrength,
      );
      integrateParticles(
        particles,
        dynamics,
        particleConfig.referenceHz,
        1000 / particleConfig.referenceHz,
      );
    }

    // Genişleme sonrası en küçük mesafe
    let finalMinDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const d = Math.hypot(particles.x[j] - particles.x[i], particles.y[j] - particles.y[i]);
        finalMinDist = Math.min(finalMinDist, d);
      }
    }

    // Parçacıklar temas bariyeri sayesinde dışarı itilmiş ve mesafe belirgin şekilde açılmıştır
    expect(finalMinDist).toBeGreaterThan(initialMinDist);
    expect(finalMinDist).toBeGreaterThanOrEqual(8.5);
  });
});
