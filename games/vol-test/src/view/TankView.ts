import type Phaser from 'phaser';
import { poseSourceOf, PoseShadow, type PoseSourceNode } from '@volstudio/core';
import { Spring1D } from '@volstudio/core/math';
import { LIGHT, TANK_SHADOW_HEIGHT } from '@/config/light';
import { TANK_ART, type TankArt } from '@/config/tankView';
import type { TankSpec } from '@/config/vehicles';
import { TEXTURE_SCALE, tankTexture } from './textures';
import { TreadRig } from './TreadRig';
import { TankLights } from './TankLights';
import type { TankFrame, VehicleView } from './VehicleView';

export type { TankFrame } from './VehicleView';

const INV = 1 / TEXTURE_SCALE;
const FEELER_SPRING = { stiffness: 90, damping: 9 };
/** Gölge ışığın tersine düşer; biçimi parçaların pozundan gelir (CORE `PoseShadow`). */
const SHADOW = {
  offsetX: LIGHT.x * TANK_SHADOW_HEIGHT,
  offsetY: LIGHT.y * TANK_SHADOW_HEIGHT,
  alpha: 0.32,
  depth: 9,
};

/**
 * Organik-robotik tankın sahne karşılığı. Paletler (`TreadRig`) yerdedir.
 * Gövde, çekirdek, duyargalar ve
 * taret bir üst katmandadır ve süspansiyonun yunuslama/yalpa ötelemesiyle
 * paletlerin üstünde kayar. Taret gövdeden bağımsız döner, namlu atışta geri
 * teper. Parça dokuları ve ölçüleri aracın sanat tablosundan gelir (`TANK_ART`).
 */
export class TankView implements VehicleView {
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
  private readonly art: TankArt;
  private elapsedMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly spec: TankSpec,
    lighting?: Phaser.GameObjects.Container,
  ) {
    const art = TANK_ART[spec.id];
    this.art = art;
    this.shadow = new PoseShadow(scene, SHADOW);
    this.lights = new TankLights(scene, spec, lighting);

    this.treads = new TreadRig(scene, spec);

    const hull = scene.add.image(0, 0, tankTexture(spec.id, 'hull')).setScale(INV);
    const feeler = art.feeler;
    this.feelers = [-1, 1].map((side) =>
      scene.add
        .image(feeler.anchorX, side * feeler.anchorY, tankTexture(spec.id, 'feeler'))
        .setOrigin(1 / feeler.width, 0.5)
        .setScale(INV)
        .setRotation(Math.PI - side * feeler.rest),
    );
    this.turret = scene.add
      .image(0, 0, tankTexture(spec.id, 'turret'))
      .setOrigin(art.turret.pivotX / art.turret.width, 0.5)
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

    const rest = this.art.feeler.rest;
    const sway = Math.sin(this.elapsedMs / 380) * 0.08;
    const drag = Math.min(0.5, frame.speed / (this.spec.tank.maxSpeed * 2.6));
    this.feelers.forEach((feeler, index) => {
      const side = index === 0 ? -1 : 1;
      const target = -frame.angularVelocity * 0.12 + side * (sway - drag * 0.6);
      const offset = this.feelerSprings[index].update(target, deltaMs, FEELER_SPRING);
      feeler.setRotation(Math.PI - side * (rest - drag * 0.25) + offset);
    });
    this.shadow.update(this.shadowSource);
  }

  setParts(mask: number): void {
    this.treads.setBroken(mask);
  }

  setPresent(present: boolean): void {
    this.root.setVisible(present);
    if (present) return;
    this.shadow.clear();
    this.lights.silence();
  }

  destroy(): void {
    this.shadow.destroy();
    this.lights.destroy();
    this.root.destroy();
  }
}
