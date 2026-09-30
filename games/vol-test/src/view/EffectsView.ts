import type Phaser from 'phaser';
import type { Projectiles } from '@/sim/combat/Projectiles';
import { ParticleFx } from './effects/ParticleFx';
import { TracerLayer } from './effects/TracerLayer';
import { TreadMarks } from './effects/TreadMarks';

/**
 * Sunum efektlerinin tek girişi: mermi izleri, parçacıklar ve palet izleri.
 * Her katman kendi dosyasındadır; hiçbiri simülasyona geri yazmaz.
 */
export class EffectsView {
  private readonly tracers: TracerLayer;
  private readonly particles: ParticleFx;
  private readonly marks: TreadMarks;

  constructor(scene: Phaser.Scene) {
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

  updateEmitters(
    x: number,
    y: number,
    hull: number,
    speed: number,
    boosting: boolean,
    slipping: boolean,
  ): void {
    this.particles.follow(x, y, hull, speed, boosting, slipping);
  }

  updateTreadMarks(
    x: number,
    y: number,
    hull: number,
    groundLeft: number,
    groundRight: number,
    trackOffset: number,
  ): void {
    this.marks.track(x, y, hull, groundLeft, groundRight, trackOffset);
  }

  update(projectiles: Projectiles, alpha: number, deltaMs: number): void {
    this.tracers.draw(projectiles, alpha);
    this.marks.fade(deltaMs);
  }

  destroy(): void {
    this.tracers.destroy();
    this.particles.destroy();
    this.marks.destroy();
  }
}
