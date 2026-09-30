import type Phaser from 'phaser';
import { RingBuffer } from '@volstudio/core/collections';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';

interface Mark {
  readonly image: Phaser.GameObjects.Image;
  bornMs: number;
}

/**
 * Palet izleri. İz, paletlerin YERDE katettiği yoldan bırakılır: patinaj iz
 * uzatmaz. Havuz dolunca en eski iz yeniden kullanılır; izler ömürleri
 * boyunca söner.
 */
export class TreadMarks {
  private readonly marks = new RingBuffer<Mark>(FX.marks.capacity);
  private readonly pool: Mark[] = [];
  private readonly lastAt = { left: 0, right: 0 };
  private nowMs = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Yer yolu aralığı her geçildiğinde iki paletin altına iz bırakır. */
  track(
    x: number,
    y: number,
    hull: number,
    groundLeft: number,
    groundRight: number,
    trackOffset: number,
  ): void {
    const sides: ReadonlyArray<readonly ['left' | 'right', number, number]> = [
      ['left', groundLeft, -1],
      ['right', groundRight, 1],
    ];
    for (const [key, distance, side] of sides) {
      if (Math.abs(distance - this.lastAt[key]) < FX.marks.spacing) continue;
      this.lastAt[key] = distance;
      this.place(
        x - Math.sin(hull) * trackOffset * side,
        y + Math.cos(hull) * trackOffset * side,
        hull,
      );
    }
  }

  /** İzleri yaşlarına göre söndürür. */
  fade(deltaMs: number): void {
    this.nowMs += deltaMs;
    for (let index = 0; index < this.marks.size; index++) {
      const mark = this.marks.at(index);
      if (!mark) continue;
      const age = (this.nowMs - mark.bornMs) / FX.marks.lifeMs;
      mark.image.setAlpha(age >= 1 ? 0 : FX.marks.alpha * (1 - age));
    }
  }

  destroy(): void {
    for (const mark of this.pool) mark.image.destroy();
  }

  private place(x: number, y: number, hull: number): void {
    let mark: Mark;
    if (this.pool.length < FX.marks.capacity) {
      mark = {
        image: this.scene.add.image(x, y, TEXTURE.mark).setTint(PALETTE.treadMark).setDepth(2),
        bornMs: this.nowMs,
      };
      this.pool.push(mark);
    } else {
      mark = this.marks.first!;
    }
    mark.image
      .setPosition(x, y)
      .setRotation(hull + Math.PI / 2)
      .setAlpha(FX.marks.alpha);
    mark.bornMs = this.nowMs;
    this.marks.push(mark);
  }
}
