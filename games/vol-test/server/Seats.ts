import { NETWORK } from '../src/config/network';

/** Boş en küçük yuvayı verir; çıkan oyuncunun yuvası yeniden kullanılır. */
export class SeatPool {
  private readonly taken: boolean[];

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new RangeError('Yuva sayısı pozitif tam sayı olmalı.');
    this.taken = Array.from({ length: capacity }, () => false);
  }

  acquire(): number | null {
    const seat = this.taken.indexOf(false);
    if (seat < 0) return null;
    this.taken[seat] = true;
    return seat;
  }

  release(seat: number): void {
    if (Number.isSafeInteger(seat) && seat >= 0 && seat < this.capacity) this.taken[seat] = false;
  }

  get used(): number {
    return this.taken.filter(Boolean).length;
  }
}

/** Yuvalar dünya merkezinde bir halka oluşturur; komşu yuva aralığı araç gövdesinden büyüktür. */
export function seatPoint(
  seat: number,
  capacity: number,
  center: { readonly x: number; readonly y: number },
): { x: number; y: number; hull: number } {
  const angle = (seat / capacity) * Math.PI * 2;
  return {
    x: center.x + Math.cos(angle) * NETWORK.seatRadius,
    y: center.y + Math.sin(angle) * NETWORK.seatRadius,
    hull: angle,
  };
}
