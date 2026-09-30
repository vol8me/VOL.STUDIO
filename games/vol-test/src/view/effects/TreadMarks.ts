import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE } from '../textures';
import { DecalPool } from './DecalPool';

interface TrackPrint {
  /** Son parçanın bittiği temas noktası ve o andaki yer yolu. */
  x: number;
  y: number;
  ground: number;
}

/**
 * Palet izleri: paletin temas noktasının yoluna serilen sürekli bant. Her
 * parça bir pabuç adımıdır ve enine pabuç izini taşır; dönüşte bant yayı,
 * yerinde dönüşte iki ters yayı izler. Parça paletlerin YERDE katettiği yolla
 * (patinaj iz uzatmaz) tetiklenir. Kayan palet desen basmaz; onun izi
 * `SkidMarks` çizgisidir.
 */
export class TreadMarks {
  private readonly decals: DecalPool;
  private readonly prints = new Map<number, [TrackPrint, TrackPrint]>();

  constructor(scene: Phaser.Scene, capacityScale = 1) {
    const marks = FX.marks;
    this.decals = new DecalPool(scene, {
      texture: TEXTURE.treadPrint,
      tint: PALETTE.treadMark,
      capacity: Math.max(1, Math.round(marks.capacity * capacityScale)),
      depth: marks.depth,
      lifeMs: marks.lifeMs,
      holdShare: marks.holdShare,
    });
  }

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
    const grounds = [groundLeft, groundRight];
    const skids = [skidLeft, skidRight];
    let pair = this.prints.get(key);
    const fresh = !pair;
    if (!pair) {
      pair = [
        { x: 0, y: 0, ground: 0 },
        { x: 0, y: 0, ground: 0 },
      ];
      this.prints.set(key, pair);
    }
    for (let index = 0; index < 2; index++) {
      const print = pair[index];
      const side = index === 0 ? -1 : 1;
      const px = x - Math.sin(hull) * trackOffset * side;
      const py = y + Math.cos(hull) * trackOffset * side;
      const ground = grounds[index];
      if (fresh) {
        print.x = px;
        print.y = py;
        print.ground = ground;
        continue;
      }
      if (ground - print.ground < FX.marks.spacing) continue;
      const length = Math.hypot(px - print.x, py - print.y);
      if (!skids[index] && length > 0) {
        this.decals.place(
          (print.x + px) / 2,
          (print.y + py) / 2,
          Math.atan2(py - print.y, px - print.x),
          length,
          FX.marks.width,
          FX.marks.alpha,
        );
      }
      print.x = px;
      print.y = py;
      print.ground = ground;
    }
  }

  /** Kaldırılan aracın iz durumunu bırakır; zemindeki izler sönerek kalır. */
  forget(key: number): void {
    this.prints.delete(key);
  }

  fade(deltaMs: number): void {
    this.decals.fade(deltaMs);
  }

  destroy(): void {
    this.decals.destroy();
  }
}
