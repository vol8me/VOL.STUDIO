import type Phaser from 'phaser';
import type { PartFactory } from './parts';

/**
 * `PartFactory`nin Phaser gerçeklemesi: nesneler doğrudan `Image` ve `TileSprite`tır (sarmalayıcı yok),
 * sahnenin görüntü listesine eklenir ve `destroy` ile sahneden çıkar.
 */
export function phaserParts(scene: Phaser.Scene): PartFactory {
  return {
    image: (key) => scene.add.image(0, 0, key),
    tile: (key, width, height) => scene.add.tileSprite(0, 0, width, height, key),
  };
}
