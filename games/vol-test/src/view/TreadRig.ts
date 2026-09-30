import type Phaser from 'phaser';
import { TANK } from '@/config/tank';
import { TEXTURE, TEXTURE_SCALE } from './textures';

const INV = 1 / TEXTURE_SCALE;
/**
 * Palet geometrisi fizikten türer: palet merkezi `trackOffset`te, eni gövde
 * ayak izinin dış kenarına kadar, uçlar ayak izinin boyunda yarım daire.
 */
const TREAD_OFFSET = TANK.trackOffset;
const TREAD_HEIGHT = 2 * (TANK.halfWidth - TANK.trackOffset);
const TREAD_LENGTH = 2 * TANK.halfLength - TREAD_HEIGHT;
/** Palet ucundaki dönüşün yarıçapı: palet eninin yarısı. */
const TREAD_END_RADIUS = TREAD_HEIGHT / 2;
const TREAD_TEXTURE_HEIGHT = 12;
/** tread-end.svg içindeki dairenin çapı. */
const TREAD_END_TEXTURE_DIAMETER = 11.2;

/**
 * İki palet: yüzey yoluyla kayan bant ve bandın döndüğü yarım daire uçlar.
 * Uçtaki halkalar aynı yolla döner; patinajda palet döner, tank ilerlemez.
 */
export class TreadRig {
  /** Tank kabının alt katmanları: önce uçlar, sonra bantlar. */
  readonly parts: readonly Phaser.GameObjects.GameObject[];
  private readonly bands: [Phaser.GameObjects.TileSprite, Phaser.GameObjects.TileSprite];
  private readonly ends: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.ends = [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        scene.add
          .image((end * TREAD_LENGTH) / 2, side * TREAD_OFFSET, TEXTURE.treadEnd)
          .setScale(INV * (TREAD_HEIGHT / TREAD_END_TEXTURE_DIAMETER)),
      ),
    );
    const band = (side: number): Phaser.GameObjects.TileSprite =>
      scene.add
        .tileSprite(
          0,
          side * TREAD_OFFSET,
          TREAD_LENGTH * TEXTURE_SCALE,
          TREAD_HEIGHT * TEXTURE_SCALE,
          TEXTURE.tread,
        )
        .setScale(INV)
        .setTileScale(1, TREAD_HEIGHT / TREAD_TEXTURE_HEIGHT);
    this.bands = [band(-1), band(1)];
    this.parts = [...this.ends, ...this.bands];
  }

  /** Palet yüzey yolları (birim): bant dokusu kayar, uçlar döner. */
  update(treadLeft: number, treadRight: number): void {
    const [left, right] = this.bands;
    left.tilePositionX = -treadLeft * TEXTURE_SCALE;
    right.tilePositionX = -treadRight * TEXTURE_SCALE;
    this.ends.forEach((end, index) => {
      end.setRotation((index < 2 ? treadLeft : treadRight) / TREAD_END_RADIUS);
    });
  }
}
