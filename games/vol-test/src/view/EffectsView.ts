import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import type { EffectProfile } from '@/config/quality';
import type { Projectiles } from '@/sim/combat/Projectiles';
import { Blasts } from './effects/Blasts';
import { ParticleFx } from './effects/ParticleFx';
import { SkidMarks } from './effects/SkidMarks';
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
  /** Paletlerin zemine göre kayma hızı (birim/s): kayma izi bununla çizilir. */
  readonly slideLeft: number;
  readonly slideRight: number;
  readonly trackOffset: number;
}

/**
 * Sunum efektlerinin tek girişi: mermiler ve duman izleri, namlu patlaması,
 * patlamalar, paylaşılan parçacıklar, palet ve kayma izleri, araç başına
 * egzoz/toz. Her katman kendi dosyasındadır; hiçbiri simülasyona geri yazmaz.
 *
 * Kalite profili parçacık sayısını ve mermi ışımasını canlı değiştirir; zemin
 * izlerinin havuz kapasitesi kurulumda profilden alınır.
 */
export class EffectsView {
  private readonly tracers: TracerLayer;
  private readonly particles: ParticleFx;
  private readonly blasts: Blasts;
  private readonly marks: TreadMarks;
  private readonly skids: SkidMarks;
  private readonly trails = new Map<number, VehicleTrail>();
  private frameMs = 0;
  private readonly emitTrail = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    travelled: number,
    speed: number,
  ): void => {
    const spacing = FX.shell.trailSpacing;
    const frameTravel = (this.frameMs / 1000) * speed;
    const before = Math.floor(Math.max(0, travelled - frameTravel) / spacing);
    const now = Math.floor(travelled / spacing);
    for (let mark = before + 1; mark <= now; mark++) {
      const back = travelled - mark * spacing;
      this.particles.trail(x - dx * back, y - dy * back);
    }
  };

  constructor(
    private readonly scene: Phaser.Scene,
    profile: EffectProfile,
  ) {
    this.blasts = new Blasts(scene, profile.decals);
    this.skids = new SkidMarks(scene, profile.decals);
    this.marks = new TreadMarks(scene, profile.decals);
    this.tracers = new TracerLayer(scene);
    this.particles = new ParticleFx(scene);
    this.applyProfile(profile);
  }

  /** Kalite değişimi: parçacık çarpanı ve mermi ışıması anında uygulanır. */
  applyProfile(profile: EffectProfile): void {
    this.particles.setScale(profile.particles);
    this.tracers.setGlow(profile.glow);
  }

  /** Atış: namlu patlaması parçacıkları ve basınç halkası. */
  muzzle(x: number, y: number, angle: number): void {
    this.particles.muzzle(x, y, angle);
    this.blasts.muzzle(x, y);
  }

  /**
   * Mermi patladı. Duvarda patlama duvardan geri (`angle`nın tersine) açılır;
   * yerde her yöne saçılır. İkisi de yanık bırakır.
   */
  explode(x: number, y: number, angle: number, surface: 'wall' | 'ground'): void {
    this.particles.blast(x, y, surface === 'wall' ? angle + Math.PI : null);
    this.blasts.explode(x, y, true);
  }

  /** Mermi araca isabet etti: yanıksız küçük patlama. */
  hit(x: number, y: number, angle: number): void {
    this.particles.hit(x, y, angle);
    this.blasts.explode(x, y, false, FX.hit.flashScale);
  }

  wallHit(x: number, y: number, normalX: number, normalY: number, strength: number): void {
    this.particles.wallHit(x, y, normalX, normalY, strength);
  }

  /** Aracın egzoz, toz, palet ve kayma izini günceller; araç ilk görüldüğünde kurulur. */
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
      frame.slideLeft >= FX.skid.minSlide,
      frame.slideRight >= FX.skid.minSlide,
    );
    this.skids.track(
      id,
      frame.x,
      frame.y,
      frame.hull,
      frame.slideLeft,
      frame.slideRight,
      frame.trackOffset,
    );
  }

  /** Kaldırılan aracın akan efektlerini söker; zemindeki izler sönerek kalır. */
  removeVehicle(id: number): void {
    this.trails.get(id)?.destroy();
    this.trails.delete(id);
    this.marks.forget(id);
    this.skids.forget(id);
  }

  /** Sunum karesi: mermiler ve duman izleri, patlama katmanları, iz sönümü. */
  update(projectiles: Projectiles, alpha: number, deltaMs: number): void {
    this.frameMs = deltaMs;
    this.tracers.draw(projectiles, alpha, deltaMs > 0 ? this.emitTrail : undefined);
    this.blasts.update(deltaMs);
    this.marks.fade(deltaMs);
    this.skids.fade(deltaMs);
  }

  destroy(): void {
    this.tracers.destroy();
    this.particles.destroy();
    this.blasts.destroy();
    this.marks.destroy();
    this.skids.destroy();
    for (const trail of this.trails.values()) trail.destroy();
    this.trails.clear();
  }
}
