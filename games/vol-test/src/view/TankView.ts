import type Phaser from 'phaser';
import { poseSourceOf, PoseShadow, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import type { TankPose } from '@/sim/tank/Tank';
import { TEXTURE, TEXTURE_SCALE } from './textures';
import { TreadRig } from './TreadRig';
import { TankLights } from './TankLights';

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
const FEELER_SPRING = { stiffness: 90, damping: 9 };
/** Gölge ışığın tersine düşer; biçimi parçaların pozundan gelir (CORE `PoseShadow`). */
const SHADOW = { offsetX: 3, offsetY: 5, alpha: 0.32, depth: 9 };

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
  private readonly lights: TankLights;
  private readonly turretRig: Phaser.GameObjects.Container;
  private readonly turret: Phaser.GameObjects.Image;
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene, lighting?: Phaser.GameObjects.Container) {
    this.shadow = new PoseShadow(scene, SHADOW);
    this.lights = new TankLights(scene, lighting);

    this.treads = new TreadRig(scene);

    const hull = scene.add.image(0, 0, TEXTURE.hull).setScale(INV);
    this.feelers = [-1, 1].map((side) =>
      scene.add
        .image(-17, side * 6.5, TEXTURE.feeler)
        .setOrigin(1 / 18, 0.5)
        .setScale(INV)
        .setRotation(Math.PI - side * 0.35),
    );
    this.turret = scene.add
      .image(0, 0, TEXTURE.turret)
      .setOrigin(TURRET_PIVOT.x, TURRET_PIVOT.y)
      .setScale(INV);
    this.turretRig = scene.add.container(0, 0, [this.turret]);
    this.body = scene.add.container(0, 0, [
      ...this.feelers,
      hull,
      this.lights.bodyPart,
      this.turretRig,
    ]);

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
    this.lights.fire();
  }

  update(frame: TankFrame, deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.root.setPosition(frame.x, frame.y);
    this.root.setRotation(frame.hull);

    this.treads.update(frame.treadLeft, frame.treadRight);

    this.body.setPosition(frame.pitch, frame.roll);
    this.turretRig.setRotation(frame.turret - frame.hull);
    this.turret.setX(this.lights.update(frame, deltaMs));

    const sway = Math.sin(this.elapsedMs / 380) * 0.08;
    const drag = Math.min(0.5, frame.speed / 600);
    this.feelers.forEach((feeler, index) => {
      const side = index === 0 ? -1 : 1;
      const target = -frame.angularVelocity * 0.12 + side * (sway - drag * 0.6);
      const offset = this.feelerSprings[index].update(target, deltaMs, FEELER_SPRING);
      feeler.setRotation(Math.PI - side * (0.35 - drag * 0.25) + offset);
    });
    this.shadow.update(this.shadowSource);
  }

  destroy(): void {
    this.shadow.destroy();
    this.lights.destroy();
    this.root.destroy();
  }
}
