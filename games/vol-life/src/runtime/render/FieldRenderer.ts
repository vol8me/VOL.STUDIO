import type { Rect } from '@volstudio/core';
import Phaser from 'phaser';
import type { FieldSet } from '@/runtime/sim/FieldSet';
import { rasterizeFields } from '@/runtime/render/FieldRasterizer';

const FIELD_TEXTURE_KEY = 'vol-life:fields';

export class FieldRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly imageData: ImageData;
  private readonly image: Phaser.GameObjects.Image;
  private readonly boundary: Phaser.GameObjects.Graphics;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    fields: FieldSet,
    bounds: Readonly<Rect>,
  ) {
    const texture = scene.textures.createCanvas(
      FIELD_TEXTURE_KEY,
      fields.resolution,
      fields.resolution,
    );
    if (!texture) throw new Error('Alan dokusu oluşturulamadı.');
    this.texture = texture;
    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.imageData = texture.context.createImageData(fields.resolution, fields.resolution);
    this.image = scene.add
      .image(0, 0, FIELD_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(bounds.width, bounds.height)
      .setDepth(-1000);
    this.image.setPosition(bounds.x, bounds.y);
    this.boundary = scene.add.graphics().setDepth(-800);
    this.boundary.lineStyle(2, 0x9edfff, 0.42);
    this.boundary.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  render(fields: FieldSet): void {
    rasterizeFields(fields, this.imageData.data);
    this.texture.putData(this.imageData, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.destroy();
    this.boundary.destroy();
    this.scene.textures.remove(FIELD_TEXTURE_KEY);
  }
}
