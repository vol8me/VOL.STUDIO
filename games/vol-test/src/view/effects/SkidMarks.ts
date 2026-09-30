import type Phaser from 'phaser';
import { RingBuffer } from '@volstudio/core/collections';
import { clamp } from '@volstudio/core/math/interpolation';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';

interface Segment {
  readonly image: Phaser.GameObjects.Image;
  bornMs: number;
  strength: number;
}

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
  private readonly segments = new RingBuffer<Segment>(FX.skid.capacity);
  private readonly pool: Segment[] = [];
  private readonly contacts = new Map<number, [Contact, Contact]>();
  private nowMs = 0;

  constructor(private readonly scene: Phaser.Scene) {}

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
      if (slide < FX.skid.minSlide) {
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
      if (length < FX.skid.segment) continue;
      const strength = clamp(
        (slide - FX.skid.minSlide) / (FX.skid.fullSlide - FX.skid.minSlide),
        FX.skid.minStrength,
        1,
      );
      this.place(contact.x, contact.y, px, py, length, strength);
      contact.x = px;
      contact.y = py;
    }
  }

  /** Kaldırılan aracın çizgi durumunu bırakır; zemindeki izler sönerek kalır. */
  forget(key: number): void {
    this.contacts.delete(key);
  }

  fade(deltaMs: number): void {
    this.nowMs += deltaMs;
    const hold = FX.skid.lifeMs * FX.skid.holdShare;
    for (let index = 0; index < this.segments.size; index++) {
      const segment = this.segments.at(index);
      if (!segment) continue;
      const age = this.nowMs - segment.bornMs;
      const fade = age <= hold ? 1 : 1 - (age - hold) / (FX.skid.lifeMs - hold);
      segment.image.setAlpha(Math.max(0, fade) * FX.skid.alpha * segment.strength);
    }
  }

  destroy(): void {
    for (const segment of this.pool) segment.image.destroy();
  }

  private place(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    length: number,
    strength: number,
  ): void {
    let segment: Segment;
    if (this.pool.length < FX.skid.capacity) {
      segment = {
        image: this.scene.add
          .image(fromX, fromY, TEXTURE.skid)
          .setTint(PALETTE.skidMark)
          .setDepth(FX.skid.depth),
        bornMs: this.nowMs,
        strength,
      };
      this.pool.push(segment);
    } else {
      segment = this.segments.first!;
    }
    // Parça bir önceki parçanın bittiği yerden başlar: çizgi kesintisizdir.
    segment.image
      .setPosition((fromX + toX) / 2, (fromY + toY) / 2)
      .setRotation(Math.atan2(toY - fromY, toX - fromX))
      .setDisplaySize(length + FX.skid.overlap, FX.skid.width)
      .setAlpha(FX.skid.alpha * strength);
    segment.bornMs = this.nowMs;
    segment.strength = strength;
    this.segments.push(segment);
  }
}
