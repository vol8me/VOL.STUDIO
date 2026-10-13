import { wrapAngle } from '@volstudio/core/math';
import { NETWORK } from '../src/config/network';

export interface SeatPoint {
  readonly x: number;
  readonly y: number;
  readonly hull: number;
}

/**
 * Yuvalar dünya merkezinde bir halka oluşturur ve merkeze bakar; komşu yuva aralığı araç
 * gövdesinden büyüktür.
 */
export function seatPoint(
  seat: number,
  capacity: number,
  center: { readonly x: number; readonly y: number },
): SeatPoint {
  const angle = (seat / capacity) * Math.PI * 2;
  return {
    x: center.x + Math.cos(angle) * NETWORK.seatRadius,
    y: center.y + Math.sin(angle) * NETWORK.seatRadius,
    hull: wrapAngle(angle + Math.PI),
  };
}

/**
 * Takımın kullanabileceği yuvalar: halka takım sayısı kadar eşit yaya bölünür, her takım kendi
 * yayında doğar. Takımsız araç bütün halkayı kullanır.
 */
export function seatsFor(team: number | null, capacity: number, teams: number): number[] {
  if (team === null) return Array.from({ length: capacity }, (_, seat) => seat);
  const share = Math.floor(capacity / teams);
  return Array.from({ length: share }, (_, index) => team * share + index);
}

/**
 * Tehditlerden en uzak yuvayı seçer (en küçük uzaklığı en büyük olan); eşitlikte küçük numara.
 * Doğan araç düşmanın dibine düşmesin ve iki doğan aynı yuvaya yığılmasın diye araçlar tehdit sayılır.
 */
export function chooseSeat(
  seats: readonly number[],
  capacity: number,
  center: { readonly x: number; readonly y: number },
  threats: readonly { readonly x: number; readonly y: number }[],
): number {
  if (seats.length === 0) throw new RangeError('Doğma yuvası listesi boş olamaz.');
  let best = seats[0];
  let bestGap = -1;
  for (const seat of seats) {
    const point = seatPoint(seat, capacity, center);
    let gap = Number.POSITIVE_INFINITY;
    for (const threat of threats)
      gap = Math.min(gap, Math.hypot(point.x - threat.x, point.y - threat.y));
    if (gap > bestGap) {
      bestGap = gap;
      best = seat;
    }
  }
  return best;
}
