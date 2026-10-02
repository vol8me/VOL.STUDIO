import type Phaser from 'phaser';
import { TANK } from '@/config/tank';
import { TEXTURE, TEXTURE_SCALE } from './textures';
import { TREAD_VIEW } from '@/config/tankView';
import { treadFrame } from './TreadTexture';

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
/** tread-end.svg içindeki dairenin çapı. */
const TREAD_END_TEXTURE_DIAMETER = 11.2;

/**
 * İki palet: yüzey yoluyla kayan bant ve bandın döndüğü yarım daire uçlar.
 * Uçtaki halkalar aynı yolla döner; patinajda palet döner, tank ilerlemez.
 */
export class TreadRig {
  /** Tank kabının alt katmanları: tabanlar, uçlar, bantlar. */
  readonly parts: readonly Phaser.GameObjects.GameObject[];
  /** Gölge veren katı parçalar: tabanlar ve uçlar (bant dokusu gölge vermez). */
  readonly shadowCasters: readonly Phaser.GameObjects.Image[];
  private readonly bands: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private readonly ends: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.ends = [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        scene.add
          .image((end * TREAD_LENGTH) / 2, side * TREAD_OFFSET, TEXTURE.treadEnd)
          .setScale(INV * (TREAD_HEIGHT / TREAD_END_TEXTURE_DIAMETER)),
      ),
    );
    const band = (side: number): Phaser.GameObjects.Image =>
      scene.add
        .image(0, side * TREAD_OFFSET, TEXTURE.treadBand, 0)
        .setDisplaySize(TREAD_VIEW.width, TREAD_VIEW.height);
    const bases = [-1, 1].map((side) =>
      scene.add
        .image(0, side * TREAD_OFFSET, TEXTURE.treadBase)
        .setDisplaySize(TREAD_LENGTH, TREAD_HEIGHT),
    );
    this.bands = [band(-1), band(1)];
    this.parts = [...bases, ...this.ends, ...this.bands];
    this.shadowCasters = [...bases, ...this.ends];
  }

  /** Palet yüzey yolları (birim): bant dokusu kayar, uçlar döner. */
  update(treadLeft: number, treadRight: number): void {
    const [left, right] = this.bands;
    left.setFrame(treadFrame(treadLeft));
    right.setFrame(treadFrame(treadRight));
    this.ends.forEach((end, index) => {
      end.setRotation((index < 2 ? treadLeft : treadRight) / TREAD_END_RADIUS);
    });
  }
}
