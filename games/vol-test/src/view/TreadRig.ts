import type Phaser from 'phaser';
import { TANK_ART, treadView, type TreadView } from '@/config/tankView';
import type { TankSpec } from '@/config/vehicles';
import { TEXTURE, TEXTURE_SCALE, treadBandTexture, VEHICLE_ATLAS } from './textures';
import { treadFrame } from './TreadTexture';

const INV = 1 / TEXTURE_SCALE;
/** tread-end.svg içindeki dairenin çapı. */
const TREAD_END_TEXTURE_DIAMETER = 11.2;
/** Kırık paletin rengi, bandın yerinden oynama açısı (rad) ve saydamlığı. */
const BROKEN = { tint: 0x2b2326, skew: 0.07, alpha: 0.85 } as const;

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
  private readonly tint: number;

  constructor(scene: Phaser.Scene, spec: TankSpec) {
    const view: TreadView = treadView(spec);
    const tint = TANK_ART[spec.id].treadTint;
    this.tint = tint;
    this.endRadius = view.height / 2;
    this.ends = [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        scene.add
          .image((end * view.width) / 2, side * view.offset, VEHICLE_ATLAS, TEXTURE.treadEnd)
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
        .image(0, side * view.offset, VEHICLE_ATLAS, TEXTURE.treadBase)
        .setDisplaySize(view.width, view.height),
    );
    this.bands = [band(-1), band(1)];
    this.parts = [...bases, ...this.ends, ...this.bands];
    this.shadowCasters = [...bases, ...this.ends];
  }

  /**
   * Kırık paletler (bit 0 sol, bit 1 sağ): bant kararır, yerinden oynar ve arka çarkı düşer; palet
   * yine zeminle birlikte akar (serbest döner), yani yerde sürünen ölü bir bant görünür.
   */
  setBroken(mask: number): void {
    this.bands.forEach((band, side) => {
      const broken = (mask & (1 << side)) !== 0;
      band
        .setTint(broken ? BROKEN.tint : this.tint)
        .setAlpha(broken ? BROKEN.alpha : 1)
        .setRotation(broken ? (side === 0 ? -BROKEN.skew : BROKEN.skew) : 0);
      this.ends[side * 2].setVisible(!broken);
    });
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
