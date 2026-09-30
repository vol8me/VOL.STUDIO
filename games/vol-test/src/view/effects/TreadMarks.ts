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
 * uzatmaz. Kayan palet desen basmaz; onun izi `SkidMarks` çizgisidir. Havuz dolunca en eski iz yeniden kullanılır; izler ömürleri
 * boyunca söner.
 */
export class TreadMarks {
  private readonly marks = new RingBuffer<Mark>(FX.marks.capacity);
  private readonly pool: Mark[] = [];
  /** Araç başına son izin bırakıldığı yer yolları. */
  private readonly lastAt = new Map<number, { left: number; right: number }>();
  private nowMs = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Yer yolu aralığı her geçildiğinde iki paletin altına iz bırakır. */
  track(
    key: number,
    x: number,
    y: number,
    hull: number,
    groundLeft: number,
    groundRight: number,
    trackOffset: number,
    skidLeft = false,
    skidRight = false,
  ): void {
    const sides: ReadonlyArray<readonly ['left' | 'right', number, number, boolean]> = [
      ['left', groundLeft, -1, skidLeft],
      ['right', groundRight, 1, skidRight],
    ];
    let last = this.lastAt.get(key);
    if (!last) {
      last = { left: groundLeft, right: groundRight };
      this.lastAt.set(key, last);
    }
    for (const [track, distance, side, skidding] of sides) {
      if (Math.abs(distance - last[track]) < FX.marks.spacing) continue;
      last[track] = distance;
      if (skidding) continue;
      this.place(
        x - Math.sin(hull) * trackOffset * side,
        y + Math.cos(hull) * trackOffset * side,
        hull,
      );
    }
  }

  /** Kaldırılan aracın iz durumunu bırakır; zemindeki izler sönerek kalır. */
  forget(key: number): void {
    this.lastAt.delete(key);
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
