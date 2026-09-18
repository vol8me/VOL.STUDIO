import type { Rect } from '@volstudio/core';
import Phaser from 'phaser';
import type { FieldSet } from '@/runtime/sim/FieldSet';
import { rasterizeFields } from '@/runtime/render/FieldRasterizer';

const FIELD_TEXTURE_KEY = 'vol-life:fields';

export class FieldRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly imageData: ImageData;
  private readonly image: Phaser.GameObjects.Image;
  private readonly pixelBuffer: Uint8Array;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    fields: FieldSet,
    bounds: Readonly<Rect>,
    private readonly shade: Float32Array | null = null,
  ) {
    if (shade && shade.length !== fields.length) {
      throw new RangeError(`Gölge tamponu ${fields.length} değer taşımalı: ${shade.length}`);
    }
    const texture = scene.textures.createCanvas(
      FIELD_TEXTURE_KEY,
      fields.resolution,
      fields.resolution,
    );
    if (!texture) throw new Error('Alan dokusu oluşturulamadı.');
    this.texture = texture;
    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.imageData = texture.context.createImageData(fields.resolution, fields.resolution);
    this.pixelBuffer = new Uint8Array(this.imageData.data.buffer);
    this.image = scene.add
      .image(0, 0, FIELD_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(bounds.width, bounds.height)
      .setDepth(-1000);
    this.image.setPosition(bounds.x, bounds.y);
  }

  render(fields: FieldSet): void {
    rasterizeFields(fields, this.imageData.data, this.shade);

    const renderer = this.scene.game?.renderer as
      | (Phaser.Renderer.WebGL.WebGLRenderer & {
          glTextureUnits?: { bind: (tex: unknown, unit?: number) => void };
        })
      | undefined;
    const glTexture = this.texture.source?.[0]?.glTexture;
    if (glTexture && renderer?.gl) {
      const gl = renderer.gl;
      if (renderer.glTextureUnits?.bind) {
        renderer.glTextureUnits.bind(glTexture, 0);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, glTexture.webGLTexture);
      }
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        fields.resolution,
        fields.resolution,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.pixelBuffer,
      );
      return;
    }

    this.texture.putData(this.imageData, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.destroy();
    this.scene.textures.remove(FIELD_TEXTURE_KEY);
  }
}
