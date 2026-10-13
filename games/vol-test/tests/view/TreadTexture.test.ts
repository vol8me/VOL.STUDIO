import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { TREAD_FRAMES, treadView } from '@/config/tankView';
import { STRIKER } from '@/config/vehicles';
import { createTreadTexture, treadFrame } from '@/view/TreadTexture';
import { fakeScene } from '../support/fakeScene';

describe('TreadTexture', () => {
  it('iki yönde pabuç periyodu içinde kalan sonlu kareler seçer', () => {
    for (const travel of [-100000, -8, -1, 0, 1, 7.999, 8, 100000]) {
      const frame = treadFrame(travel);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(TREAD_FRAMES.frames);
      expect(treadFrame(travel + TREAD_FRAMES.period)).toBe(frame);
    }
  });
  it('tam kareleri küçük ortak dokuya bir kez yerleştirir', () => {
    const scene = fakeScene();
    const view = treadView(STRIKER);
    createTreadTexture(scene as unknown as Phaser.Scene, 'source', 'band', 4, view);
    createTreadTexture(scene as unknown as Phaser.Scene, 'source', 'band', 4, view);
    expect(scene.textures.addSpriteSheet).toHaveBeenCalledOnce();
    expect(scene.textures.addCanvas).toHaveBeenCalledWith(
      'band',
      expect.objectContaining({ width: 1312, height: 176 }),
    );
    expect(scene.textures.addSpriteSheet).toHaveBeenCalledWith('band', expect.anything(), {
      frameWidth: 164,
      frameHeight: 44,
      endFrame: 31,
    });
  });
});
