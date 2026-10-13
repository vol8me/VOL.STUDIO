import type Phaser from 'phaser';
import { TREAD_FRAMES, type TreadView } from '@/config/tankView';

export function treadFrame(travel: number): number {
  const phase = ((travel % TREAD_FRAMES.period) + TREAD_FRAMES.period) % TREAD_FRAMES.period;
  return Math.floor((phase / TREAD_FRAMES.period) * TREAD_FRAMES.frames);
}

export function createTreadTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  key: string,
  scale: number,
  view: TreadView,
): void {
  if (scene.textures.exists(key)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as CanvasImageSource;
  const width = Math.round(view.width * scale);
  const height = Math.round(view.height * scale);
  const period = view.period * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width * view.columns;
  canvas.height = height * Math.ceil(view.frames / view.columns);
  const graphics = canvas.getContext('2d');
  if (!graphics) throw new Error('Palet dokusu için 2B canvas bağlamı alınamadı');
  for (let frame = 0; frame < view.frames; frame++) {
    const x = (frame % view.columns) * width;
    const y = Math.floor(frame / view.columns) * height;
    const offset = (frame / view.frames) * period;
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
    endFrame: view.frames - 1,
  });
}
