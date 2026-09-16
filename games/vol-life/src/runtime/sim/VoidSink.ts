import type { FringeGenes } from '@/config/genome';
import type { MatterReservoir } from '@/runtime/sim/MatterReservoir';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { VoidDeathEvent } from '@/runtime/sim/WorldEvents';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';

/**
 * Üç Void bölgesi (DESIGN.md §2): güvenli alanda kuvvet KESİNLİKLE sıfır, dar
 * tidal fringe'de dışa doğru stres, kıyının ötesinde geri dönüşsüz deactivation.
 * Bounce, clamp ve restitution yoktur.
 */
export class VoidSink {
  private readonly scratch: DomainSample = { distance: 0, normalX: 1, normalY: 0 };

  constructor(
    private readonly domain: WorldDomain,
    private readonly fringe: FringeGenes,
  ) {
    if (!(fringe.widthUnits > 0) || !Number.isFinite(fringe.widthUnits)) {
      throw new RangeError(`Fringe genişliği pozitif ve sonlu olmalı: ${fringe.widthUnits}`);
    }
    if (!(fringe.tidalStrength >= 0) || !Number.isFinite(fringe.tidalStrength)) {
      throw new RangeError(
        `Tidal stres negatif olmayan sonlu sayı olmalı: ${fringe.tidalStrength}`,
      );
    }
  }

  /**
   * Her aktif parçacığın kıyı mesafesini ölçer ve fringe içindekilere dışa
   * doğru stres ekler; dönüş etkilenen sayıdır. Güvenli alana hiçbir şey yazılmaz.
   */
  applyFringeStress(particles: ParticleStore): number {
    const { active, x, y, forceX, forceY, edgeDistance, capacity } = particles;
    const width = this.fringe.widthUnits;
    const strength = this.fringe.tidalStrength;
    let affected = 0;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      const sample = this.domain.sampleDistanceAndNormal(x[slot], y[slot], this.scratch);
      edgeDistance[slot] = sample.distance;
      if (strength === 0 || sample.distance < 0 || sample.distance >= width) continue;
      const stress = strength * (1 - sample.distance / width);
      forceX[slot] += sample.normalX * stress;
      forceY[slot] += sample.normalY * stress;
      affected++;
    }
    return affected;
  }

  /**
   * Kıyıyı geçen aktif parçacıkları aynı tick içinde düşürür ve rezervuara yazar.
   * Üretilen olay DONDURULMUŞ bir kopyadır: slot hemen yeniden kullanılsa bile
   * sunum ve tarih aynı ölümü anlatmayı sürdürür.
   */
  collectCrossings(
    particles: ParticleStore,
    reservoir: MatterReservoir,
    tick: number,
    out: VoidDeathEvent[],
  ): number {
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError(`Olay tick'i negatif olmayan tam sayı olmalı: ${tick}`);
    }
    const { active, x, y, vx, vy, type, stableId, capacity } = particles;
    let crossed = 0;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      const sample = this.domain.sampleDistanceAndNormal(x[slot], y[slot], this.scratch);
      if (sample.distance >= 0) continue;
      out.push(
        Object.freeze({
          kind: 'void-death' as const,
          tick,
          stableId: stableId[slot],
          x: x[slot],
          y: y[slot],
          vx: vx[slot],
          vy: vy[slot],
          type: type[slot],
          normalX: sample.normalX,
          normalY: sample.normalY,
        }),
      );
      particles.deactivateSlot(slot);
      crossed++;
    }
    if (crossed > 0) reservoir.recordVoidLoss(crossed);
    return crossed;
  }
}
