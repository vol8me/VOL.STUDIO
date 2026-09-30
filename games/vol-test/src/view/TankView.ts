import Phaser from 'phaser';
import { poseSourceOf, PoseShadow, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import type { TankPose } from '@/sim/tank/Tank';
import { TEXTURE, TEXTURE_SCALE } from './textures';
import { TreadRig } from './TreadRig';

/** Görünümün her kare okuduğu tank durumu (ara değerli poz + sürüş sinyalleri). */
export interface TankFrame extends TankPose {
  readonly treadLeft: number;
  readonly treadRight: number;
  readonly speed: number;
  readonly angularVelocity: number;
  readonly boosting: boolean;
}

const INV = 1 / TEXTURE_SCALE;
/** Taret pivotunun doku içindeki yeri (turret.svg). */
const TURRET_PIVOT = { x: 12 / 44, y: 0.5 };
const MUZZLE_X = 29;
/** Namlu geri tepmesi: atışta geri kayar, yayla yerine döner. */
const BARREL = { kick: -210, stiffness: 420, damping: 22, max: 5 };
const FEELER_SPRING = { stiffness: 90, damping: 9 };
/** Gölge ışığın tersine düşer; gövde yaylandıkça gölge de az kayar. */
/** Gölge ışığın tersine düşer; biçimi parçaların pozundan gelir (CORE `PoseShadow`). */
const SHADOW = { offsetX: 3, offsetY: 5, alpha: 0.32, depth: 9 };
const FLASH_MS = 70;

/**
 * Organik-robotik tankın sahne karşılığı. Paletler (`TreadRig`) yerdedir.
 * Gövde, çekirdek, duyargalar ve
 * taret bir üst katmandadır ve süspansiyonun yunuslama/yalpa ötelemesiyle
 * paletlerin üstünde kayar. Taret gövdeden bağımsız döner, namlu atışta geri
 * teper.
 */
export class TankView {
  readonly root: Phaser.GameObjects.Container;
  private readonly shadow: PoseShadow;
  /** Gölge veren katı parçalar; ışık kaynakları (çekirdek, parlama) dahil değil. */
  private readonly shadowSource: PoseSourceNode;
  private readonly treads: TreadRig;
  private readonly body: Phaser.GameObjects.Container;
  private readonly feelers: Phaser.GameObjects.Image[];
  private readonly feelerSprings = [new Spring1D(), new Spring1D()];
  private readonly core: Phaser.GameObjects.Image;
  private readonly turretRig: Phaser.GameObjects.Container;
  private readonly turret: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Image;
  private readonly barrel = new Spring1D();
  private pulse = 0;
  private flashMs = 0;
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene) {
    this.shadow = new PoseShadow(scene, SHADOW);

    this.treads = new TreadRig(scene);

    const hull = scene.add.image(0, 0, TEXTURE.hull).setScale(INV);
    this.feelers = [-1, 1].map((side) =>
      scene.add
        .image(-17, side * 6.5, TEXTURE.feeler)
        .setOrigin(1 / 18, 0.5)
        .setScale(INV)
        .setRotation(Math.PI - side * 0.35),
    );
    this.core = scene.add
      .image(0, 0, TEXTURE.core)
      .setScale(INV * 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.turret = scene.add
      .image(0, 0, TEXTURE.turret)
      .setOrigin(TURRET_PIVOT.x, TURRET_PIVOT.y)
      .setScale(INV);
    this.flash = scene.add
      .image(MUZZLE_X, 0, TEXTURE.flash)
      .setOrigin(0, 0.5)
      .setScale(INV)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.turretRig = scene.add.container(0, 0, [this.turret, this.flash]);
    this.body = scene.add.container(0, 0, [...this.feelers, hull, this.core, this.turretRig]);

    this.root = scene.add.container(0, 0, [...this.treads.parts, this.body]);
    this.shadowSource = poseSourceOf([
      ...this.treads.shadowCasters,
      ...this.feelers,
      hull,
      this.turret,
    ]);
    this.root.setDepth(10);
  }

  /** Atış anında namluyu geri iter ve ağız parlamasını başlatır. */
  fire(): void {
    this.barrel.velocity += BARREL.kick;
    this.flashMs = FLASH_MS;
    this.flash.setScale(INV * (0.85 + Math.random() * 0.35));
    this.flash.setVisible(true);
  }

  update(frame: TankFrame, deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.root.setPosition(frame.x, frame.y);
    this.root.setRotation(frame.hull);

    this.treads.update(frame.treadLeft, frame.treadRight);

    this.body.setPosition(frame.pitch, frame.roll);
    this.shadow.update(this.shadowSource);
    this.turretRig.setRotation(frame.turret - frame.hull);

    this.barrel.update(0, deltaMs, BARREL);
    this.barrel.value = Phaser.Math.Clamp(this.barrel.value, -BARREL.max, 0);
    this.turret.setX(this.barrel.value);
    this.flash.setX(MUZZLE_X + this.barrel.value);
    if (this.flashMs > 0) {
      this.flashMs -= deltaMs;
      this.flash.setAlpha(Math.max(0, this.flashMs / FLASH_MS));
      if (this.flashMs <= 0) this.flash.setVisible(false);
    }

    const effort = Math.min(1, frame.speed / 230) + (frame.boosting ? 0.8 : 0);
    this.pulse += (deltaMs / 1000) * (1.4 + effort * 3.2) * Math.PI * 2;
    const beat = 0.5 + 0.5 * Math.sin(this.pulse);
    this.core.setScale(INV * (0.68 + beat * 0.14 + (frame.boosting ? 0.1 : 0)));
    this.core.setAlpha(0.55 + beat * 0.35);

    const sway = Math.sin(this.elapsedMs / 380) * 0.08;
    const drag = Math.min(0.5, frame.speed / 600);
    this.feelers.forEach((feeler, index) => {
      const side = index === 0 ? -1 : 1;
      const target = -frame.angularVelocity * 0.12 + side * (sway - drag * 0.6);
      const offset = this.feelerSprings[index].update(target, deltaMs, FEELER_SPRING);
      feeler.setRotation(Math.PI - side * (0.35 - drag * 0.25) + offset);
    });
  }

  destroy(): void {
    this.shadow.destroy();
    this.root.destroy();
  }
}
