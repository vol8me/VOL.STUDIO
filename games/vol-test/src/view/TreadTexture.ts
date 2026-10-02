import type Phaser from 'phaser';
import { TREAD_VIEW } from '@/config/tankView';

export function treadFrame(travel: number): number {
  const phase = ((travel % TREAD_VIEW.period) + TREAD_VIEW.period) % TREAD_VIEW.period;
  return Math.floor((phase / TREAD_VIEW.period) * TREAD_VIEW.frames);
}

export function createTreadTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  key: string,
  scale: number,
): void {
  if (scene.textures.exists(key)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const width = Math.round(TREAD_VIEW.width * scale);
  const height = Math.round(TREAD_VIEW.height * scale);
  const period = TREAD_VIEW.period * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width * TREAD_VIEW.columns;
  canvas.height = height * Math.ceil(TREAD_VIEW.frames / TREAD_VIEW.columns);
  const graphics = canvas.getContext('2d');
  if (!graphics) throw new Error('Palet dokusu için 2B canvas bağlamı alınamadı');
  for (let frame = 0; frame < TREAD_VIEW.frames; frame++) {
    const x = (frame % TREAD_VIEW.columns) * width;
    const y = Math.floor(frame / TREAD_VIEW.columns) * height;
    const offset = (frame / TREAD_VIEW.frames) * period;
    graphics.save();
    graphics.beginPath();
    graphics.rect(x, y, width, height);
    graphics.clip();
    for (let tile = -period; tile < width; tile += period)
      graphics.drawImage(source, x + tile + offset, y, period, height);
    graphics.restore();
  }
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error('Palet dokusu kaydedilemedi');
  scene.textures.addSpriteSheet(key, texture, {
    frameWidth: width,
    frameHeight: height,
    endFrame: TREAD_VIEW.frames - 1,
  });
}
