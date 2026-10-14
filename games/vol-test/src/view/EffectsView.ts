import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import type { EffectProfile } from '@/config/quality';
import type { Projectiles } from '@/sim/combat/Projectiles';
import { DEBRIS } from '@/config/debris';
import type { VehicleSpec } from '@/config/vehicles';
import { createRandom, type Random } from '@volstudio/core/random';
import { wreckArt, type ChunkArt } from './debrisArt';
import { Blasts } from './effects/Blasts';
import { Debris } from './effects/Debris';
import { ParticleFx } from './effects/ParticleFx';
import { SkidMarks } from './effects/SkidMarks';
import { TracerLayer } from './effects/TracerLayer';
import { TreadMarks } from './effects/TreadMarks';
import { VehicleTrail } from './effects/VehicleTrail';

/** Üç tamsayıdan [0,1) karma: aynı olay aynı sayıyı verir (rastgelelik yok). */
export function hash01(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

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
  /** Araç paletle sürülür: palet ve kayma izi bırakır. Bacaklı araç izini kendi ayak basışıyla verir. */
  readonly tracked: boolean;
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
  private readonly debris: Debris;
  private readonly random: Random = createRandom(FX.debrisSeed);
  private readonly trails = new Map<number, VehicleTrail>();
  private frameMs = 0;
  private timeScale = 1;
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
    bounds: { readonly width: number; readonly height: number } = { width: 4096, height: 4096 },
  ) {
    this.blasts = new Blasts(scene, profile.decals);
    this.skids = new SkidMarks(scene, profile.decals);
    this.marks = new TreadMarks(scene, profile.decals);
    this.tracers = new TracerLayer(scene);
    this.particles = new ParticleFx(scene);
    this.debris = new Debris(scene, bounds);
    this.applyProfile(profile);
  }

  /** Kalite değişimi: parçacık çarpanı ve mermi ışıması anında uygulanır. */
  applyProfile(profile: EffectProfile): void {
    this.particles.setScale(profile.particles);
    this.debris.setScale(profile.particles);
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

  /**
   * Araç imha edildi: hızlı bir patlama (parlama, şok halkası, yanık, sıcak parçacıklar) ve aracın
   * gerçek parçalarıyla levha kıymıklarının savrulması. Parçalar yere sekip durur, bir süre kalır ve söner.
   */
  wreck(spec: VehicleSpec, x: number, y: number, vx: number, vy: number): void {
    this.particles.wreck(x, y);
    this.blasts.explode(x, y, true, FX.wreck.flashScale, FX.wreck.ringScale);
    const art = wreckArt(spec);
    const wreck = DEBRIS.wreck;
    const count = this.range(wreck.count, true);
    const turn = this.random.next() * Math.PI * 2;
    for (let index = 0; index < count; index++) {
      const big = index < wreck.big;
      const pool = big ? art.big : art.shards;
      const angle = turn + ((index + this.random.next() * 0.6) / count) * Math.PI * 2;
      this.launch(pool[Math.floor(this.random.next() * pool.length)], {
        x,
        y,
        angle,
        speed: this.range(wreck.speed),
        lift: this.range(wreck.lift),
        spin: this.range(wreck.spin) * (this.random.next() < 0.5 ? -1 : 1),
        scale: big ? 1 : this.range(wreck.scale),
        height: 10,
        hot: true,
        inherit: { vx: vx * 0.35, vy: vy * 0.35 },
      });
    }
  }

  /**
   * Mermi araca isabet etti: ara sıra gövdeden küçük bir kıymık kopar. Şans isabet noktasından ve hedef
   * kimliğinden türer (aynı olay aynı sonucu verir), böylece tekrarlanabilir ve kalabalık olmaz.
   */
  chip(spec: VehicleSpec, target: number, x: number, y: number, angle: number): void {
    const hit = DEBRIS.hit;
    const roll = hash01(target, Math.round(x), Math.round(y));
    if (roll >= hit.chance) return;
    const art = wreckArt(spec);
    const count = roll < hit.chance * 0.3 ? hit.count[1] : hit.count[0];
    for (let index = 0; index < count; index++) {
      this.launch(art.shards[Math.floor(this.random.next() * art.shards.length)], {
        x,
        y,
        angle: angle + (this.random.next() - 0.5) * 1.6,
        speed: this.range(hit.speed),
        lift: this.range(hit.lift),
        spin: (this.random.next() - 0.5) * 24,
        scale: this.range(hit.scale),
        height: 6,
        hot: false,
        inherit: { vx: 0, vy: 0 },
      });
    }
  }

  wallHit(x: number, y: number, normalX: number, normalY: number, strength: number): void {
    this.particles.wallHit(x, y, normalX, normalY, strength);
  }

  /** Aracın egzoz, toz, palet ve kayma izini günceller; araç ilk görüldüğünde kurulur. */
  updateVehicle(id: number, frame: VehicleFxFrame): void {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = new VehicleTrail(this.scene);
      trail.setTimeScale(this.timeScale);
      this.trails.set(id, trail);
    }
    trail.follow(frame.x, frame.y, frame.hull, frame.speed, frame.boosting, frame.slipping);
    if (!frame.tracked) return;
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

  private launch(
    art: ChunkArt,
    shot: {
      x: number;
      y: number;
      angle: number;
      speed: number;
      lift: number;
      spin: number;
      scale: number;
      height: number;
      hot: boolean;
      inherit: { vx: number; vy: number };
    },
  ): void {
    const vx = Math.cos(shot.angle) * shot.speed + shot.inherit.vx;
    const vy = Math.sin(shot.angle) * shot.speed + shot.inherit.vy;
    this.debris.spawn({
      art,
      x: shot.x,
      y: shot.y,
      angle: Math.atan2(vy, vx),
      speed: Math.hypot(vx, vy),
      lift: shot.lift,
      spin: shot.spin,
      scale: shot.scale,
      lifeMs: this.range(DEBRIS.lifeMs),
      height: shot.height,
      hot: shot.hot,
    });
  }

  /** Aralıktan değer; `whole` tam sayı ister. */
  private range(span: readonly [number, number], whole = false): number {
    const value = span[0] + this.random.next() * (span[1] - span[0] + (whole ? 1 : 0));
    return whole ? Math.floor(value) : value;
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
    const timeScale = deltaMs > 0 ? 1 : 0;
    if (timeScale !== this.timeScale) {
      this.timeScale = timeScale;
      this.particles.setTimeScale(timeScale);
      for (const trail of this.trails.values()) trail.setTimeScale(timeScale);
    }
    this.tracers.draw(projectiles, alpha, deltaMs > 0 ? this.emitTrail : undefined);
    this.blasts.update(deltaMs);
    this.debris.update(deltaMs);
    this.marks.fade(deltaMs);
    this.skids.fade(deltaMs);
  }

  destroy(): void {
    this.tracers.destroy();
    this.particles.destroy();
    this.blasts.destroy();
    this.debris.destroy();
    this.marks.destroy();
    this.skids.destroy();
    for (const trail of this.trails.values()) trail.destroy();
    this.trails.clear();
  }
}
