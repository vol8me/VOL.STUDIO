import { describe, expect, it, vi } from 'vitest';
import { BLEND } from '../../src/art/parts';
import { phaserParts } from '../../src/art/phaserParts';

describe('BLEND', () => {
  it('Phaser BlendModes sabitleriyle aynı değerlerdir (NORMAL 0, ADD 1)', () => {
    // Phaser jsdom'da yüklenemez; sabitlerin Phaser'daki eşitliği e2e'de gerçek tarayıcıda sınanır.
    expect(BLEND).toEqual({ normal: 0, add: 1 });
  });
});

describe('phaserParts', () => {
  it('Image ve TileSprite nesnelerini doğrudan sahneden üretir, sarmalayıcı koymaz', () => {
    const image = { kind: 'image' };
    const tile = { kind: 'tile' };
    const scene = {
      add: {
        image: vi.fn(() => image),
        tileSprite: vi.fn(() => tile),
      },
    };
    const factory = phaserParts(scene as never);
    expect(factory.image('kit-a')).toBe(image);
    expect(scene.add.image).toHaveBeenCalledWith(0, 0, 'kit-a');
    expect(factory.tile('kit-b', 64, 32)).toBe(tile);
    expect(scene.add.tileSprite).toHaveBeenCalledWith(0, 0, 64, 32, 'kit-b');
  });
});
