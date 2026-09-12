import Phaser from 'phaser';
import type { FieldSet } from '@/runtime/sim/FieldSet';
import { rasterizeFields } from '@/runtime/render/FieldRasterizer';

const FIELD_TEXTURE_KEY = 'vol-life:fields';

export class FieldRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly imageData: ImageData;
  private readonly tile: Phaser.GameObjects.TileSprite;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    fields: FieldSet,
    worldSize: number,
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
    const tileScale = worldSize / fields.resolution;
    this.tile = scene.add
      .tileSprite(-worldSize * 4, -worldSize * 4, worldSize * 9, worldSize * 9, FIELD_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setTileScale(tileScale, tileScale)
      .setDepth(-1000);
  }

  render(fields: FieldSet): void {
    rasterizeFields(fields, this.imageData.data);
    this.texture.putData(this.imageData, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tile.destroy();
    this.scene.textures.remove(FIELD_TEXTURE_KEY);
  }
}
