import Phaser from 'phaser';
import { Spring1D, type SpringConfig } from '@volstudio/core/math';
import type { FeelerArt } from '@/config/sensors';
import { TEXTURE } from './textures';

/** Duyargaların yayı: Striker'ın duyargasıyla aynıdır (yumuşak ve hafif salınımlı). */
const SPRING: SpringConfig = { stiffness: 90, damping: 9 };
/** Doku boyutu (px): gövde 3 px, uç 1 px; ölçek bunu araç ölçüsüne çevirir. */
const TEXTURE_PX = { length: 32, thickness: 4 } as const;
/** Işık dokusu (`TEXTURE.spark`) 16 px'tir. */
const TIP_TEXTURE_PX = 16;

/** Duyargaları süren hareket girdisi: gövde dönüşü ve hız. */
export interface FeelerDrive {
  readonly angularVelocity: number;
  /** Hızın azami hıza oranı (0..1). */
  readonly effort: number;
}

/**
 * Bir çift yaylı duyarga: gövde dönerken geriden sürüklenir, hızlandıkça arkaya yatar ve boşta yavaşça
 * sallanır. Striker'ın duyargalarıyla aynı hareket dilidir, ama öne ya da arkaya bakabilir ve bağlandığı
 * parçanın konumu, açısı ve ölçeği her karede verilir (örümcek göğsü yaslanır, döner ve yükselir).
 */
export class Feelers {
  private readonly stalks: Phaser.GameObjects.Image[];
  private readonly tips: Phaser.GameObjects.Image[];
  private readonly springs = [new Spring1D(), new Spring1D()];

  constructor(
    scene: Phaser.Scene,
    private readonly art: FeelerArt,
  ) {
    this.stalks = [-1, 1].map(() =>
      scene.add
        .image(0, 0, TEXTURE.antenna)
        .setOrigin(0, 0.5)
        .setScale(art.length / TEXTURE_PX.length, art.thickness / TEXTURE_PX.thickness)
        .setTint(art.tint),
    );
    this.tips = [-1, 1].map(() =>
      scene.add
        .image(0, 0, TEXTURE.spark)
        .setScale(art.tipSize / TIP_TEXTURE_PX)
        .setTint(art.glow)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
  }

  /** Duyargaların gölge veren gövde görüntüleri (ışık uçları dahil değil). */
  get parts(): readonly Phaser.GameObjects.Image[] {
    return this.stalks;
  }

  /** Kapsayıcıya konacak bütün görüntüler: önce gövdeler, üstlerinde ışık uçları. */
  get objects(): readonly Phaser.GameObjects.Image[] {
    return [...this.stalks, ...this.tips];
  }

  /**
   * Duyargaları yerleştirir ve yaylarını ilerletir.
   * @param x,y bağlandığı parçanın merkezi (üst kapsayıcı uzayında).
   * @param rotation parçanın dönüşü.
   * @param size parçanın görünür büyüklüğü (perspektifle yükselen göğüs duyargayı da büyütür).
   * @param elapsedMs boşta sallanma için sürekli saat.
   */
  update(
    x: number,
    y: number,
    rotation: number,
    size: number,
    drive: FeelerDrive,
    elapsedMs: number,
    deltaMs: number,
  ): void {
    const { art } = this;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const sway = Math.sin(elapsedMs / 380) * 0.08;
    const drag = Math.min(0.5, drive.effort * 0.38);
    this.stalks.forEach((stalk, index) => {
      const side = index === 0 ? -1 : 1;
      const target = -drive.angularVelocity * 0.12 + side * (sway + art.facing * drag * 0.35);
      const offset = this.springs[index].update(target, deltaMs, SPRING);
      const localX = art.anchorX * size;
      const localY = side * art.anchorY * size;
      const px = x + localX * cos - localY * sin;
      const py = y + localX * sin + localY * cos;
      // Önde dışa, arkada arkadan dışa açılır; hızlandıkça iki yönde de biraz daha açılır.
      const base = art.facing === 1 ? side * art.rest : Math.PI - side * art.rest;
      const angle = rotation + base + offset;
      stalk
        .setPosition(px, py)
        .setRotation(angle)
        .setScale(
          (art.length / TEXTURE_PX.length) * size,
          (art.thickness / TEXTURE_PX.thickness) * size,
        );
      const tip = this.tips[index];
      tip.setPosition(
        px + Math.cos(angle) * art.length * size,
        py + Math.sin(angle) * art.length * size,
      );
      tip.setAlpha(0.6 + 0.4 * Math.sin(elapsedMs / 260 + index * 1.7));
    });
  }

  destroy(): void {
    for (const part of [...this.stalks, ...this.tips]) part.destroy();
  }
}
