import Phaser from 'phaser';
import { Spring1D } from '@volstudio/core/math';
import { SHOT_LOOK } from '@/config/fx';
import { TANK_ART, TANK_LIGHTS, type TankArt } from '@/config/tankView';
import type { TankSpec } from '@/config/vehicles';
import { muzzlePose, type MuzzlePose } from '@/sim/muzzle';
import { TEXTURE, TEXTURE_SCALE } from './textures';
import type { TankFrame } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;
/** Çekirdek ölçeği nabzın ortalamasıdır; striker'ın 0.75'i referans alınır. */
const CORE_REFERENCE = 0.75;

export class TankLights {
  private readonly layer: Phaser.GameObjects.Container;
  private readonly ownsLayer: boolean;
  readonly bodyPart: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly barrel = new Spring1D();
  private readonly tip: MuzzlePose = { x: 0, y: 0, angle: 0 };
  private readonly art: TankArt;
  private readonly coreGain: number;
  private flashMs = 0;
  private pulse = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: TankSpec,
    layer?: Phaser.GameObjects.Container,
  ) {
    this.art = TANK_ART[spec.id];
    this.coreGain = this.art.coreScale / CORE_REFERENCE;
    this.ownsLayer = !layer;
    this.layer =
      layer ??
      scene.add.container(0, 0).setDepth(TANK_LIGHTS.depth).setBlendMode(Phaser.BlendModes.ADD);
    this.bodyPart = scene.add
      .image(0, 0, TEXTURE.core)
      .setScale(INV * this.art.coreScale)
      .setTint(this.art.glow);
    this.flash = scene.add
      .image(0, 0, TEXTURE.flash)
      .setTint(SHOT_LOOK[spec.armament.weapon.style].glow)
      .setOrigin(0, 0.5)
      .setScale(INV * this.art.flashScale)
      .setVisible(false);
    this.layer.add(this.flash);
  }

  fire(): void {
    this.barrel.velocity += this.art.barrel.kick;
    this.flashMs = TANK_LIGHTS.flashMs;
    this.flash.setScale(INV * this.art.flashScale * (0.85 + Math.random() * 0.35));
    this.flash.setVisible(true);
  }

  /** Namlu yayını ilerletir, çekirdeği ve ağız parlamasını yerleştirir; taretin geri kayması döner. */
  update(frame: TankFrame, deltaMs: number): number {
    const barrel = this.art.barrel;
    this.barrel.update(0, deltaMs, barrel);
    this.barrel.value = Phaser.Math.Clamp(this.barrel.value, -barrel.max, 0);
    const effort = Math.min(1, frame.speed / this.spec.tank.maxSpeed) + (frame.boosting ? 0.8 : 0);
    this.pulse += (deltaMs / 1000) * (1.4 + effort * 3.2) * Math.PI * 2;
    const beat = 0.5 + 0.5 * Math.sin(this.pulse);
    this.bodyPart.setScale(INV * this.coreGain * (0.68 + beat * 0.14 + (frame.boosting ? 0.1 : 0)));
    this.bodyPart.setAlpha(0.55 + beat * 0.35);
    const armament = this.spec.armament;
    const tip = muzzlePose(
      frame,
      armament,
      0,
      this.tip,
      armament.mounts[0].reach + this.barrel.value,
    );
    this.flash.setPosition(tip.x, tip.y);
    this.flash.setRotation(tip.angle);
    if (this.flashMs > 0) {
      this.flashMs = Math.max(0, this.flashMs - deltaMs);
      this.flash.setAlpha(this.flashMs / TANK_LIGHTS.flashMs);
      this.flash.setVisible(this.flashMs > 0);
    }
    return this.barrel.value;
  }

  /** Ağız parlaması ve namlu yayı sıfırlanır: gizlenen araçtan ışık kalmaz. */
  silence(): void {
    this.flashMs = 0;
    this.barrel.value = 0;
    this.barrel.velocity = 0;
    this.flash.setVisible(false);
  }

  destroy(): void {
    this.bodyPart.destroy();
    this.flash.destroy();
    if (this.ownsLayer) this.layer.destroy();
  }
}
