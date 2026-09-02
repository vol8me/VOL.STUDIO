import type { PoseSample } from './poseSample';

/** `Phaser.GameObjects.Image`ın bu modülün çağırdığı yüzeyi. */
export interface PoseSprite {
  setTexture(key: string, frame?: string | number): unknown;
  setPosition(x: number, y: number): unknown;
  setRotation(radians: number): unknown;
  setScale(x: number, y: number): unknown;
  setOrigin(x: number, y: number): unknown;
  setAlpha(alpha: number): unknown;
  setTint(color: number): unknown;
  setVisible(visible: boolean): unknown;
  setDepth(depth: number): unknown;
  setBlendMode(mode: number): unknown;
  destroy(): void;
}

/** `Phaser.Scene`in bu modülün çağırdığı yüzeyi. */
export interface PoseSpriteScene {
  add: { image(x: number, y: number, texture: string, frame?: string | number): PoseSprite };
}

export interface PoseSpriteStyle {
  depth: number;
  /** `undefined` ise parçanın kendi rengi korunur. */
  tint?: number;
  blendMode?: number;
}

/**
 * Bir poz örneğini ekrana basan, yeniden kullanılabilir sprite kümesi.
 *
 * Hayalet ve gölge aynı işi yapar: N parçalık bir pozu N sprite ile çizmek.
 * Kare başına sprite yaratıp yok etmek bu iki efekti de çöp üreticisine
 * çevirirdi; havuz sprite'ları saklar, fazlasını GİZLER (yok etmez) ve bir
 * sonraki daha kalabalık pozda yeniden kullanır.
 */
export class PoseSpriteSet {
  private readonly scene: PoseSpriteScene;
  private readonly style: PoseSpriteStyle;
  private readonly sprites: PoseSprite[] = [];
  private activeCount = 0;

  constructor(scene: PoseSpriteScene, style: PoseSpriteStyle) {
    this.scene = scene;
    this.style = style;
  }

  /**
   * Pozu çizer. `alphaScale` örnekteki her parçanın kendi saydamlığıyla
   * çarpılır; sönümlenen bir hayalet tek bir çarpanla kısılır.
   */
  render(samples: readonly PoseSample[], alphaScale: number, offsetX = 0, offsetY = 0): void {
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const sprite = this.sprites[i] ?? this.createSprite(sample.textureKey);
      sprite.setTexture(sample.textureKey, sample.frameName);
      sprite.setPosition(sample.x + offsetX, sample.y + offsetY);
      sprite.setRotation(sample.rotation);
      sprite.setScale(sample.scaleX, sample.scaleY);
      sprite.setOrigin(sample.originX, sample.originY);
      sprite.setAlpha(sample.alpha * alphaScale);
      sprite.setVisible(true);
    }
    for (let i = samples.length; i < this.activeCount; i++) {
      this.sprites[i].setVisible(false);
    }
    this.activeCount = samples.length;
  }

  hide(): void {
    for (let i = 0; i < this.activeCount; i++) this.sprites[i].setVisible(false);
    this.activeCount = 0;
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.activeCount = 0;
  }

  private createSprite(textureKey: string): PoseSprite {
    const sprite = this.scene.add.image(0, 0, textureKey);
    sprite.setDepth(this.style.depth);
    if (this.style.tint !== undefined) sprite.setTint(this.style.tint);
    if (this.style.blendMode !== undefined) sprite.setBlendMode(this.style.blendMode);
    sprite.setVisible(false);
    this.sprites.push(sprite);
    return sprite;
  }
}
