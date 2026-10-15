import type Phaser from 'phaser';
import type { Disposable } from '@volstudio/core';
import { WEATHER_VIEW } from '@/config/weatherView';
import type { VegetationHost, VegetationImage, VegetationLayerKind } from './VegetationLayer';

const VEGETATION = WEATHER_VIEW.vegetation;

/**
 * Döşeme dokusu: bir `RenderTexture` ve gün ışığı boyası. Doku piksel boyu kademe değişince yeniden kurulur.
 * Kalem, `RenderTexture` çizim komutunu çalıştırana dek (aşağıda hemen) kullanılır: çizim sırası kalemin
 * paylaşılan içeriğine bağlıdır, bu yüzden pişirme aynı çağrıda tamamlanır.
 */
class BakedImage implements VegetationImage {
  private texture: Phaser.GameObjects.RenderTexture | null = null;
  private visible = true;
  private tint = 0xffffff;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly alpha: number,
  ) {}

  bake(
    pens: readonly Phaser.GameObjects.Graphics[],
    originX: number,
    originY: number,
    size: number,
    texel: number,
  ): void {
    const pixels = Math.max(2, Math.ceil(size * texel));
    let texture = this.texture;
    if (!texture || texture.width !== pixels) {
      texture?.destroy();
      texture = this.scene.add
        .renderTexture(originX, originY, pixels, pixels)
        .setOrigin(0, 0)
        .setDepth(this.depth)
        .setAlpha(this.alpha)
        .setTint(this.tint)
        .setVisible(this.visible);
      this.texture = texture;
    }
    texture.setPosition(originX, originY).setDisplaySize(size, size);
    texture.clear();
    // Kalemler dünya birimiyle çizilmiştir: döşeme köşesi doku orijinine kayar, birim doku pikseline ölçeklenir.
    for (const pen of pens) {
      pen.setScale(texel);
      texture.draw(pen, -originX * texel, -originY * texel);
    }
    texture.render();
  }

  tone(tint: number): void {
    this.tint = tint;
    this.texture?.setTint(tint);
  }

  show(visible: boolean): void {
    this.visible = visible;
    this.texture?.setVisible(visible);
  }

  destroy(): void {
    this.texture?.destroy();
    this.texture = null;
  }
}

/** Çayır döşemelerinin Phaser ayağı: sahneye eklenmeyen geçici kalemler ve döşeme dokuları. */
export class PhaserVegetationHost implements VegetationHost, Disposable {
  private readonly pens: Record<VegetationLayerKind, Phaser.GameObjects.Graphics>;
  private readonly images = new Set<BakedImage>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly tipDepth: number,
  ) {
    // Sahne görüntü listesine eklenmez: yalnız dokuya çizilir, kendi başına ekrana basılmaz.
    const pen = (): Phaser.GameObjects.Graphics => scene.make.graphics({}, false);
    this.pens = { region: pen(), core: pen(), clumps: pen(), tips: pen() };
  }

  pen(kind: VegetationLayerKind): Phaser.GameObjects.Graphics {
    return this.pens[kind];
  }

  create(kind: VegetationLayerKind): VegetationImage {
    // Aynı derinlikte sıra ekleme sırasına bağlı kalırdı: komşu döşeme tabanı taşan yaprakları örterdi.
    const layer = {
      region: { depth: this.depth - 0.002, alpha: VEGETATION.base.alpha },
      core: { depth: this.depth - 0.001, alpha: VEGETATION.core.alpha },
      clumps: { depth: this.depth, alpha: 1 },
      tips: { depth: this.tipDepth, alpha: 1 },
    }[kind];
    const image = new BakedImage(this.scene, layer.depth, layer.alpha);
    this.images.add(image);
    return image;
  }

  dispose(): void {
    for (const image of this.images) image.destroy();
    this.images.clear();
    for (const pen of Object.values(this.pens)) pen.destroy();
  }
}
