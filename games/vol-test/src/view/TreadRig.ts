import type Phaser from 'phaser';
import { TANK_ART, treadView, type TreadView } from '@/config/tankView';
import type { TankSpec } from '@/config/vehicles';
import { TEXTURE, TEXTURE_SCALE, treadBandTexture } from './textures';
import { treadFrame } from './TreadTexture';

const INV = 1 / TEXTURE_SCALE;
/** tread-end.svg içindeki dairenin çapı. */
const TREAD_END_TEXTURE_DIAMETER = 11.2;

/**
 * İki palet: yüzey yoluyla kayan bant ve bandın döndüğü yarım daire uçlar.
 * Uçtaki halkalar aynı yolla döner; patinajda palet döner, tank ilerlemez.
 * Geometri aracın fizik ayak izinden türer (`treadView`).
 */
export class TreadRig {
  /** Tank kabının alt katmanları: tabanlar, uçlar, bantlar. */
  readonly parts: readonly Phaser.GameObjects.GameObject[];
  /** Gölge veren katı parçalar: tabanlar ve uçlar (bant dokusu gölge vermez). */
  readonly shadowCasters: readonly Phaser.GameObjects.Image[];
  private readonly bands: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private readonly ends: Phaser.GameObjects.Image[];
  private readonly endRadius: number;

  constructor(scene: Phaser.Scene, spec: TankSpec) {
    const view: TreadView = treadView(spec);
    const tint = TANK_ART[spec.id].treadTint;
    this.endRadius = view.height / 2;
    this.ends = [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        scene.add
          .image((end * view.width) / 2, side * view.offset, TEXTURE.treadEnd)
          .setScale(INV * (view.height / TREAD_END_TEXTURE_DIAMETER))
          .setTint(tint),
      ),
    );
    const band = (side: number): Phaser.GameObjects.Image =>
      scene.add
        .image(0, side * view.offset, treadBandTexture(spec.id), 0)
        .setDisplaySize(view.width, view.height)
        .setTint(tint);
    const bases = [-1, 1].map((side) =>
      scene.add
        .image(0, side * view.offset, TEXTURE.treadBase)
        .setDisplaySize(view.width, view.height),
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
      end.setRotation((index < 2 ? treadLeft : treadRight) / this.endRadius);
    });
  }
}
