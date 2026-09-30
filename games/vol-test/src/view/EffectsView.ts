import type Phaser from 'phaser';
import type { Projectiles } from '@/sim/combat/Projectiles';
import { ParticleFx } from './effects/ParticleFx';
import { TracerLayer } from './effects/TracerLayer';
import { TreadMarks } from './effects/TreadMarks';
import { VehicleTrail } from './effects/VehicleTrail';

/** Bir aracın efekt karesi: ara değerli poz ve iz/toz sinyalleri. */
export interface VehicleFxFrame {
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly speed: number;
  readonly boosting: boolean;
  readonly slipping: boolean;
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly trackOffset: number;
}

/**
 * Sunum efektlerinin tek girişi: mermi izleri, paylaşılan parçacıklar, palet
 * izleri ve araç başına egzoz/toz. Her katman kendi dosyasındadır; hiçbiri
 * simülasyona geri yazmaz.
 */
export class EffectsView {
  private readonly tracers: TracerLayer;
  private readonly particles: ParticleFx;
  private readonly marks: TreadMarks;
  private readonly trails = new Map<number, VehicleTrail>();

  constructor(private readonly scene: Phaser.Scene) {
    this.tracers = new TracerLayer(scene);
    this.particles = new ParticleFx(scene);
    this.marks = new TreadMarks(scene);
  }

  impact(x: number, y: number, angle: number): void {
    this.particles.impact(x, y, angle);
  }

  muzzle(x: number, y: number, angle: number): void {
    this.particles.muzzle(x, y, angle);
  }

  wallHit(x: number, y: number, normalX: number, normalY: number, strength: number): void {
    this.particles.wallHit(x, y, normalX, normalY, strength);
  }

  /** Aracın egzoz, toz ve palet izini günceller; araç ilk görüldüğünde kurulur. */
  updateVehicle(id: number, frame: VehicleFxFrame): void {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = new VehicleTrail(this.scene);
      this.trails.set(id, trail);
    }
    trail.follow(frame.x, frame.y, frame.hull, frame.speed, frame.boosting, frame.slipping);
    this.marks.track(
      id,
      frame.x,
      frame.y,
      frame.hull,
      frame.groundLeft,
      frame.groundRight,
      frame.trackOffset,
    );
  }

  /** Kaldırılan aracın akan efektlerini söker; zemindeki izler sönerek kalır. */
  removeVehicle(id: number): void {
    this.trails.get(id)?.destroy();
    this.trails.delete(id);
    this.marks.forget(id);
  }

  update(projectiles: Projectiles, alpha: number, deltaMs: number): void {
    this.tracers.draw(projectiles, alpha);
    this.marks.fade(deltaMs);
  }

  destroy(): void {
    this.tracers.destroy();
    this.particles.destroy();
    this.marks.destroy();
    for (const trail of this.trails.values()) trail.destroy();
    this.trails.clear();
  }
}
