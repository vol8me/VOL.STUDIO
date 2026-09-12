import type { WorldCameraState } from '@volstudio/core';
import Phaser from 'phaser';
import type { FieldSet } from '@/runtime/sim/FieldSet';
import { rasterizeFields } from '@/runtime/render/FieldRasterizer';

const FIELD_TEXTURE_KEY = 'vol-life:fields';
const COPY_OFFSETS = [-1, 0, 1] as const;

export class FieldRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly imageData: ImageData;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    fields: FieldSet,
    private readonly worldSize: number,
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
    for (const offsetY of COPY_OFFSETS) {
      for (const offsetX of COPY_OFFSETS) {
        const image = scene.add
          .image(0, 0, FIELD_TEXTURE_KEY)
          .setOrigin(0, 0)
          .setDisplaySize(worldSize, worldSize)
          .setDepth(-1000);
        image.setPosition(offsetX * worldSize, offsetY * worldSize);
        image.setVisible(offsetX === 0 && offsetY === 0);
        this.images.push(image);
      }
    }
  }

  render(fields: FieldSet): void {
    rasterizeFields(fields, this.imageData.data);
    this.texture.putData(this.imageData, 0, 0);
    this.texture.refresh();
  }

  updateCamera(state: WorldCameraState): void {
    if (state.overview) {
      for (let index = 0; index < this.images.length; index++) {
        this.images[index].setVisible(index === 4);
      }
      this.images[4].setPosition(0, 0);
      return;
    }

    const baseX = Math.floor(state.centerX / this.worldSize);
    const baseY = Math.floor(state.centerY / this.worldSize);
    let index = 0;
    for (const offsetY of COPY_OFFSETS) {
      for (const offsetX of COPY_OFFSETS) {
        this.images[index]
          .setPosition((baseX + offsetX) * this.worldSize, (baseY + offsetY) * this.worldSize)
          .setVisible(true);
        index++;
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const image of this.images) image.destroy();
    this.scene.textures.remove(FIELD_TEXTURE_KEY);
  }
}
