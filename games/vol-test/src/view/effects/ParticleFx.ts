import Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

const deg = Phaser.Math.RadToDeg;

const EMITTERS = {
  sparks: {
    depth: 13,
    config: {
      speed: { min: 60, max: 220 },
      lifespan: { min: 160, max: 360 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [...PALETTE.spark],
      blendMode: Phaser.BlendModes.ADD,
    },
  },
  smoke: {
    depth: 11,
    config: {
      speed: { min: 20, max: 90 },
      lifespan: { min: 380, max: 720 },
      scale: { start: 0.7, end: 2.2 },
      alpha: { start: 0.32, end: 0 },
      tint: PALETTE.smoke,
    },
  },
  exhaust: {
    depth: 9,
    config: {
      speed: { min: 20, max: 60 },
      lifespan: { min: 220, max: 420 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: PALETTE.energy,
      blendMode: Phaser.BlendModes.ADD,
      frequency: 18,
    },
  },
  dust: {
    depth: 7,
    config: {
      speed: { min: 8, max: 30 },
      lifespan: { min: 500, max: 900 },
      scale: { start: 0.6, end: 1.6 },
      alpha: { start: 0.16, end: 0 },
      tint: PALETTE.dust,
      frequency: 40,
    },
  },
} satisfies Record<string, { depth: number; config: EmitterConfig }>;

/**
 * Parçacık efektleri: isabet ve çarpma kıvılcımı, namlu ve çarpma dumanı,
 * hızlanma egzozu, hız ya da patinajla kalkan toz. Renkler oyun paletinden.
 */
export class ParticleFx {
  private readonly sparks: Emitter;
  private readonly smoke: Emitter;
  private readonly exhaust: Emitter;
  private readonly dust: Emitter;

  constructor(scene: Phaser.Scene) {
    const make = (definition: { depth: number; config: EmitterConfig }): Emitter =>
      scene.add
        .particles(0, 0, TEXTURE.spark, { ...definition.config, emitting: false })
        .setDepth(definition.depth);
    this.sparks = make(EMITTERS.sparks);
    this.smoke = make(EMITTERS.smoke);
    this.exhaust = make(EMITTERS.exhaust);
    this.dust = make(EMITTERS.dust);
  }

  /** Mermi duvara çarptı: geliş yönünün tersine kıvılcım. */
  impact(x: number, y: number, angle: number): void {
    const back = deg(angle + Math.PI);
    this.sparks.setEmitterAngle({ min: back - 60, max: back + 60 });
    this.sparks.explode(10, x, y);
  }

  /** Namlu ağzında ateş yönüne açılan duman. */
  muzzle(x: number, y: number, angle: number): void {
    const forward = deg(angle);
    this.smoke.setEmitterAngle({ min: forward - 28, max: forward + 28 });
    this.smoke.explode(7, x, y);
  }

  /** Tank duvara çarptı: çarpma şiddetiyle (0..1) ölçeklenen kıvılcım ve duman. */
  wallHit(x: number, y: number, normalX: number, normalY: number, strength: number): void {
    const outward = deg(Math.atan2(normalY, normalX));
    this.sparks.setEmitterAngle({ min: outward - 70, max: outward + 70 });
    this.sparks.explode(Math.round(4 + strength * 14), x, y);
    this.smoke.setEmitterAngle({ min: outward - 80, max: outward + 80 });
    this.smoke.explode(Math.round(3 + strength * 6), x, y);
  }

  /**
   * Egzoz ve toz kaynaklarını gövdenin arkasına taşır. Toz hızla ya da palet
   * patinajıyla (palet dönüyor, tank ilerlemiyor) kalkar.
   */
  follow(
    x: number,
    y: number,
    hull: number,
    speed: number,
    boosting: boolean,
    slipping: boolean,
  ): void {
    const rearX = x - Math.cos(hull) * FX.exhaustOffset;
    const rearY = y - Math.sin(hull) * FX.exhaustOffset;
    const outward = deg(hull + Math.PI);
    this.exhaust.setPosition(rearX, rearY);
    this.exhaust.setEmitterAngle({ min: outward - 25, max: outward + 25 });
    this.exhaust.emitting = boosting;
    this.dust.setPosition(rearX, rearY);
    this.dust.setEmitterAngle({ min: outward - 40, max: outward + 40 });
    this.dust.emitting = speed > FX.dustSpeed || slipping;
  }

  destroy(): void {
    for (const emitter of [this.sparks, this.smoke, this.exhaust, this.dust]) emitter.destroy();
  }
}
