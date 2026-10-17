import type Phaser from 'phaser';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { TEXTURE, treadFrame, VEHICLE_ATLAS } from '../textures';
import { DecalPool, type DecalRef } from './DecalPool';

/** Bir paletin temas izi: son örnek noktası, yer yolu ve devam eden bandın başlangıcı. */
interface TrackPrint {
  x: number;
  y: number;
  ground: number;
  /** Devam eden bandın başladığı nokta ve havuzdaki çıkartması; bant yoksa `run` boştur. */
  startX: number;
  startY: number;
  run: DecalRef | undefined;
}

/**
 * Palet izleri: paletin temas noktasının yoluna serilen sürekli bant. Düz yolda bant TEK çıkartma olarak
 * uzar (en çok `FX.marks.runMax`); dönüşte bandı düz çizgiden `FX.marks.bend` kadar saptıran örnekte yeni
 * parça başlar, yerinde dönüşte iki ters yayı izler. Çıkartma uzunluğu kadar pabuç adımı gösterir
 * (`treadFrame`: adım aralığı hep `FX.marks.pitch`). Böylece aynı yol onda biri kadar çıkartmayla çizilir ve
 * kalabalık savaşta havuz izi arkadan kuyruk gibi yutmaz. Parça paletlerin YERDE katettiği yolla (patinaj
 * iz uzatmaz) tetiklenir. Kayan palet desen basmaz; onun izi `SkidMarks` çizgisidir.
 */
export class TreadMarks {
  private readonly decals: DecalPool;
  private readonly prints = new Map<number, [TrackPrint, TrackPrint]>();

  constructor(scene: Phaser.Scene, capacityScale = 1) {
    const marks = FX.marks;
    this.decals = new DecalPool(scene, {
      texture: VEHICLE_ATLAS,
      frame: TEXTURE.treadPrint,
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
    let pair = this.prints.get(key);
    const fresh = !pair;
    if (!pair) {
      pair = [blank(), blank()];
      this.prints.set(key, pair);
    }
    for (let index = 0; index < 2; index++) {
      const print = pair[index];
      const side = index === 0 ? -1 : 1;
      const px = x - Math.sin(hull) * trackOffset * side;
      const py = y + Math.cos(hull) * trackOffset * side;
      const ground = index === 0 ? groundLeft : groundRight;
      if (fresh) {
        restart(print, px, py, ground);
        continue;
      }
      // Geri giden palet de iz bırakır (yer yolu mutlak sayılır); yeniden doğuşta sıfırlanan yol da yakalanır.
      if (Math.abs(ground - print.ground) < FX.marks.spacing) continue;
      const length = Math.hypot(px - print.x, py - print.y);
      // Işınlanma (yeniden doğuş, ekrana dönüş) iz kesintisidir: eski noktadan yeniye köprü çizilmez.
      if (length > FX.marks.maxJump) {
        restart(print, px, py, ground);
        continue;
      }
      // Kayan palet desen basmaz: bant biter, kayma çizgisi (`SkidMarks`) devralır.
      if (index === 0 ? skidLeft : skidRight) {
        restart(print, px, py, ground);
        continue;
      }
      if (length > 0) this.extend(print, px, py);
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

  /**
   * Bandı yeni örnek noktasına (`px`, `py`) uzatır. Önceki örnek noktası bandı düz çizgiden saptırıyorsa ya da
   * bant `runMax`i aşıyorsa o noktada bant biter ve yeni parça oradan başlar.
   */
  private extend(print: TrackPrint, px: number, py: number): void {
    const marks = FX.marks;
    if (print.run) {
      const run = Math.hypot(px - print.startX, py - print.startY);
      const bent = deviation(print, px, py) > marks.bend;
      if (bent || run > marks.runMax) {
        print.startX = print.x;
        print.startY = print.y;
        print.run = undefined;
      }
    }
    const dx = px - print.startX;
    const dy = py - print.startY;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const steps = Math.min(marks.maxGrousers, Math.max(1, Math.round(length / marks.pitch)));
    const frame = treadFrame(steps);
    const cx = print.startX + dx / 2;
    const cy = print.startY + dy / 2;
    const rotation = Math.atan2(dy, dx);
    if (print.run && this.decals.reshape(print.run, cx, cy, rotation, length, marks.width, frame))
      return;
    print.run = this.decals.place(cx, cy, rotation, length, marks.width, marks.alpha, frame);
  }
}

function blank(): TrackPrint {
  return { x: 0, y: 0, ground: 0, startX: 0, startY: 0, run: undefined };
}

/** İzi bu noktadan yeniden başlatır: bant biter, eski noktadan yeniye köprü çizilmez. */
function restart(print: TrackPrint, x: number, y: number, ground: number): void {
  print.x = x;
  print.y = y;
  print.ground = ground;
  print.startX = x;
  print.startY = y;
  print.run = undefined;
}

/** Önceki örnek noktasının, bant başından yeni uca çekilen doğruya uzaklığı (birim). */
function deviation(print: TrackPrint, px: number, py: number): number {
  const dx = px - print.startX;
  const dy = py - print.startY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 0;
  return Math.abs((print.x - print.startX) * dy - (print.y - print.startY) * dx) / length;
}
