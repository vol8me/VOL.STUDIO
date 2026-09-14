import type { FringeGenes } from '@/config/genome';
import type { MatterReservoir } from '@/runtime/sim/MatterReservoir';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';

/** Sunuma bırakılan salt okunur ölüm olayı; simülasyona geri dönemez. */
export interface VoidCrossing {
  readonly stableId: number;
  readonly x: number;
  readonly y: number;
  readonly type: number;
  readonly normalX: number;
  readonly normalY: number;
}

/**
 * Üç Void bölgesi (DESIGN.md §2): güvenli alanda kuvvet KESİNLİKLE sıfır, dar
 * tidal fringe'de dışa doğru stres, kıyının ötesinde geri dönüşsüz deactivation.
 * Bounce, clamp ve restitution yoktur.
 */
export class VoidSink {
  private readonly scratch = { x: 0, y: 0 };

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
      const distance = this.domain.distance(x[slot], y[slot]);
      edgeDistance[slot] = distance;
      if (strength === 0 || distance < 0 || distance >= width) continue;
      const stress = strength * (1 - distance / width);
      const normal = this.domain.normal(x[slot], y[slot], this.scratch);
      forceX[slot] += normal.x * stress;
      forceY[slot] += normal.y * stress;
      affected++;
    }
    return affected;
  }

  /** Kıyıyı geçen aktif parçacıkları aynı tick içinde düşürür ve rezervuara yazar. */
  collectCrossings(
    particles: ParticleStore,
    reservoir: MatterReservoir,
    out: VoidCrossing[],
  ): number {
    const { active, x, y, type, stableId, capacity } = particles;
    let crossed = 0;
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 0) continue;
      if (this.domain.distance(x[slot], y[slot]) >= 0) continue;
      const normal = this.domain.normal(x[slot], y[slot], this.scratch);
      out.push({
        stableId: stableId[slot],
        x: x[slot],
        y: y[slot],
        type: type[slot],
        normalX: normal.x,
        normalY: normal.y,
      });
      particles.deactivate(slot);
      crossed++;
    }
    if (crossed > 0) reservoir.recordVoidLoss(crossed);
    return crossed;
  }
}
