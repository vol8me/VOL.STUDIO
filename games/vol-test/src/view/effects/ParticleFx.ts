import Phaser from 'phaser';
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
} satisfies Record<string, { depth: number; config: EmitterConfig }>;

/**
 * Paylaşılan parçacık efektleri: isabet ve çarpma kıvılcımı, namlu ve çarpma
 * dumanı. Renkler oyun paletinden. Araca bağlı egzoz ve toz `VehicleTrail`da.
 */
export class ParticleFx {
  private readonly sparks: Emitter;
  private readonly smoke: Emitter;

  constructor(scene: Phaser.Scene) {
    const make = (definition: { depth: number; config: EmitterConfig }): Emitter =>
      scene.add
        .particles(0, 0, TEXTURE.spark, { ...definition.config, emitting: false })
        .setDepth(definition.depth);
    this.sparks = make(EMITTERS.sparks);
    this.smoke = make(EMITTERS.smoke);
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

  destroy(): void {
    this.sparks.destroy();
    this.smoke.destroy();
  }
}
