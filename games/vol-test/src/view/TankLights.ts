import Phaser from 'phaser';
import { Spring1D } from '@volstudio/core/math';
import { TANK_LIGHTS } from '@/config/tankView';
import type { TankFrame } from './TankView';
import { TEXTURE, TEXTURE_SCALE } from './textures';

const INV = 1 / TEXTURE_SCALE;

export class TankLights {
  private readonly layer: Phaser.GameObjects.Container;
  private readonly ownsLayer: boolean;
  readonly bodyPart: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly barrel = new Spring1D();
  private flashMs = 0;
  private pulse = 0;

  constructor(scene: Phaser.Scene, layer?: Phaser.GameObjects.Container) {
    this.ownsLayer = !layer;
    this.layer =
      layer ??
      scene.add.container(0, 0).setDepth(TANK_LIGHTS.depth).setBlendMode(Phaser.BlendModes.ADD);
    this.bodyPart = scene.add.image(0, 0, TEXTURE.core).setScale(INV * 0.75);
    this.flash = scene.add
      .image(0, 0, TEXTURE.flash)
      .setOrigin(0, 0.5)
      .setScale(INV)
      .setVisible(false);
    this.layer.add(this.flash);
  }

  fire(): void {
    this.barrel.velocity += TANK_LIGHTS.barrel.kick;
    this.flashMs = TANK_LIGHTS.flashMs;
    this.flash.setScale(INV * (0.85 + Math.random() * 0.35));
    this.flash.setVisible(true);
  }

  update(frame: TankFrame, deltaMs: number): number {
    this.barrel.update(0, deltaMs, TANK_LIGHTS.barrel);
    this.barrel.value = Phaser.Math.Clamp(this.barrel.value, -TANK_LIGHTS.barrel.max, 0);
    const cosine = Math.cos(frame.hull);
    const sine = Math.sin(frame.hull);
    const x = frame.x + frame.pitch * cosine - frame.roll * sine;
    const y = frame.y + frame.pitch * sine + frame.roll * cosine;
    const effort = Math.min(1, frame.speed / 230) + (frame.boosting ? 0.8 : 0);
    this.pulse += (deltaMs / 1000) * (1.4 + effort * 3.2) * Math.PI * 2;
    const beat = 0.5 + 0.5 * Math.sin(this.pulse);
    this.bodyPart.setScale(INV * (0.68 + beat * 0.14 + (frame.boosting ? 0.1 : 0)));
    this.bodyPart.setAlpha(0.55 + beat * 0.35);
    const reach = TANK_LIGHTS.muzzleX + this.barrel.value;
    this.flash.setPosition(x + Math.cos(frame.turret) * reach, y + Math.sin(frame.turret) * reach);
    this.flash.setRotation(frame.turret);
    if (this.flashMs > 0) {
      this.flashMs = Math.max(0, this.flashMs - deltaMs);
      this.flash.setAlpha(this.flashMs / TANK_LIGHTS.flashMs);
      this.flash.setVisible(this.flashMs > 0);
    }
    return this.barrel.value;
  }

  destroy(): void {
    this.bodyPart.destroy();
    this.flash.destroy();
    if (this.ownsLayer) this.layer.destroy();
  }
}
