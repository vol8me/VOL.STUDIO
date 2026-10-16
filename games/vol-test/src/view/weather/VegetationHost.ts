import type Phaser from 'phaser';
import type { Disposable } from '@volstudio/core';
import type {
  VegetationHost,
  VegetationImage,
  VegetationLayerKind,
  VegetationPaint,
  VegetationPenKind,
} from './VegetationLayer';

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
    private readonly scratch: () => Phaser.GameObjects.RenderTexture,
  ) {}

  bake(
    layers: readonly VegetationPaint[],
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
        .setTint(this.tint)
        .setVisible(this.visible);
      this.texture = texture;
    }
    texture.setPosition(originX, originY).setDisplaySize(size, size);
    texture.clear();
    // Kalemler dünya birimiyle çizilmiştir: döşeme köşesi doku orijinine kayar, birim doku pikseline ölçeklenir.
    // Saydam katman önce opak çizilen bir ara dokuya basılır, sonra bütün olarak saydamlıkla geçirilir.
    let staging: Phaser.GameObjects.RenderTexture | null = null;
    for (const { pen, alpha } of layers) {
      pen.setScale(texel);
      if (alpha >= 1) {
        texture.draw(pen, -originX * texel, -originY * texel);
        continue;
      }
      staging ??= this.scratch();
      if (staging.width !== pixels) staging.resize(pixels, pixels);
      staging.clear();
      staging.draw(pen, -originX * texel, -originY * texel);
      staging.render();
      staging.setAlpha(alpha);
      texture.draw(staging, 0, 0);
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
  private readonly pens: Record<VegetationPenKind, Phaser.GameObjects.Graphics>;
  private readonly images = new Set<BakedImage>();
  private staging: Phaser.GameObjects.RenderTexture | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly tipDepth: number,
  ) {
    // Sahne görüntü listesine eklenmez: yalnız dokuya çizilir, kendi başına ekrana basılmaz.
    const pen = (): Phaser.GameObjects.Graphics => scene.make.graphics({}, false);
    this.pens = { region: pen(), core: pen(), clumps: pen(), tips: pen() };
  }

  pen(kind: VegetationPenKind): Phaser.GameObjects.Graphics {
    return this.pens[kind];
  }

  create(kind: VegetationLayerKind): VegetationImage {
    const image = new BakedImage(this.scene, kind === 'body' ? this.depth : this.tipDepth, () =>
      this.stagingTexture(),
    );
    this.images.add(image);
    return image;
  }

  /** Saydam katmanların opak çizildiği ara doku: sahneye eklenmez, döşemeler arasında paylaşılır. */
  private stagingTexture(): Phaser.GameObjects.RenderTexture {
    this.staging ??= this.scene.make
      .renderTexture({ x: 0, y: 0, width: 2, height: 2 }, false)
      .setOrigin(0, 0);
    return this.staging;
  }

  dispose(): void {
    this.staging?.destroy();
    this.staging = null;
    for (const image of this.images) image.destroy();
    this.images.clear();
    for (const pen of Object.values(this.pens)) pen.destroy();
  }
}
