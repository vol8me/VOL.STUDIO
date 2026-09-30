import type Phaser from 'phaser';
import { clamp } from '@volstudio/core/math/interpolation';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';
import { DecalPool } from './DecalPool';

interface Contact {
  x: number;
  y: number;
  /** Bu palet şu an kayıyor ve çizgi sürüyor mu. */
  active: boolean;
}

/**
 * Kayma izleri. Kayan paletin temas noktası yerde sürekli bir sürtünme
 * çizgisi bırakır: çizgi temas noktasının gerçek yolunu izler (kilitli fren
 * düz, yanal kayma çapraz), koyuluğu kayma hızıyla artar. İzler uzun yaşar;
 * ömrünün ilk yarısında tam, sonra doğrusal söner.
 */
export class SkidMarks {
  private readonly decals: DecalPool;
  private readonly contacts = new Map<number, [Contact, Contact]>();

  constructor(scene: Phaser.Scene, capacityScale = 1) {
    const skid = FX.skid;
    this.decals = new DecalPool(scene, {
      texture: TEXTURE.skid,
      tint: PALETTE.skidMark,
      capacity: Math.max(1, Math.round(skid.capacity * capacityScale)),
      depth: skid.depth,
      lifeMs: skid.lifeMs,
      holdShare: skid.holdShare,
    });
  }

  /** Paletlerin kayma hızına göre çizgiyi uzatır ya da keser. */
  track(
    key: number,
    x: number,
    y: number,
    hull: number,
    slideLeft: number,
    slideRight: number,
    trackOffset: number,
  ): void {
    const skid = FX.skid;
    let pair = this.contacts.get(key);
    if (!pair) {
      pair = [
        { x: 0, y: 0, active: false },
        { x: 0, y: 0, active: false },
      ];
      this.contacts.set(key, pair);
    }
    const slides = [slideLeft, slideRight];
    for (let index = 0; index < 2; index++) {
      const contact = pair[index];
      const side = index === 0 ? -1 : 1;
      const px = x - Math.sin(hull) * trackOffset * side;
      const py = y + Math.cos(hull) * trackOffset * side;
      const slide = slides[index];
      if (slide < skid.minSlide) {
        contact.active = false;
        continue;
      }
      if (!contact.active) {
        contact.x = px;
        contact.y = py;
        contact.active = true;
        continue;
      }
      const length = Math.hypot(px - contact.x, py - contact.y);
      if (length < skid.segment) continue;
      const strength = clamp(
        (slide - skid.minSlide) / (skid.fullSlide - skid.minSlide),
        skid.minStrength,
        1,
      );
      // Parça bir önceki parçanın bittiği yerden başlar: çizgi kesintisizdir.
      this.decals.place(
        (contact.x + px) / 2,
        (contact.y + py) / 2,
        Math.atan2(py - contact.y, px - contact.x),
        length + skid.overlap,
        skid.width,
        skid.alpha * strength,
      );
      contact.x = px;
      contact.y = py;
    }
  }

  /** Kaldırılan aracın çizgi durumunu bırakır; zemindeki izler sönerek kalır. */
  forget(key: number): void {
    this.contacts.delete(key);
  }

  fade(deltaMs: number): void {
    this.decals.fade(deltaMs);
  }

  destroy(): void {
    this.decals.destroy();
  }
}
