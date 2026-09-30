import Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

const deg = Phaser.Math.RadToDeg;

const EXHAUST = {
  speed: { min: 20, max: 60 },
  lifespan: { min: 220, max: 420 },
  scale: { start: 0.5, end: 0 },
  alpha: { start: 0.8, end: 0 },
  tint: PALETTE.energy,
  blendMode: Phaser.BlendModes.ADD,
  frequency: 18,
  emitting: false,
};

const DUST = {
  speed: { min: 8, max: 30 },
  lifespan: { min: 500, max: 900 },
  scale: { start: 0.6, end: 1.6 },
  alpha: { start: 0.16, end: 0 },
  tint: PALETTE.dust,
  frequency: 40,
  emitting: false,
};

/**
 * Bir aracın arkasından akan parçacıklar: hızlanma egzozu ve hız ya da palet
 * patinajıyla (palet dönüyor, tank ilerlemiyor) kalkan toz.
 */
export class VehicleTrail {
  private readonly exhaust: Emitter;
  private readonly dust: Emitter;

  constructor(scene: Phaser.Scene) {
    this.exhaust = scene.add.particles(0, 0, TEXTURE.spark, EXHAUST).setDepth(9);
    this.dust = scene.add.particles(0, 0, TEXTURE.spark, DUST).setDepth(7);
  }

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
    this.exhaust.destroy();
    this.dust.destroy();
  }
}
