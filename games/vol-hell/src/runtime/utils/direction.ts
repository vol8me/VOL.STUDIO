/** Hareket yönünü sekiz kardinal/çapraz yöne sabitler. */
export function quantizeEightDirection(x: number, y: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) <= 0.0001) return null;
  const step = Math.PI / 4;
  return Math.round(Math.atan2(y, x) / step) * step;
}

/** İki açıyı en kısa yoldan birbirine yaklaştırır. */
export function approachAngle(current: number, target: number, amount: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * Math.min(1, Math.max(0, amount));
}

export interface FireDirectionTarget {
  readonly x: number;
  readonly y: number;
  readonly isAlive: boolean;
}

export interface MutableDirection {
  x: number;
  y: number;
}

/**
 * Manuel aim varsa onu, yoksa en yakın canlı hedefi normalize edip `out`a
 * yazar. Eşit uzaklıkta dizi sırası kazanır; replay/düşük FPS davranışı
 * kararlıdır. Her kare çağrılabildiği için yeni nesne üretmez.
 */
export function writeFireDirection(
  out: MutableDirection,
  originX: number,
  originY: number,
  manualX: number,
  manualY: number,
  targets: readonly FireDirectionTarget[],
): boolean {
  const manualLength = Math.hypot(manualX, manualY);
  if (Number.isFinite(manualLength) && manualLength > 0.0001) {
    out.x = manualX / manualLength;
    out.y = manualY / manualLength;
    return true;
  }

  let nearest: FireDirectionTarget | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (!target.isAlive || !Number.isFinite(target.x) || !Number.isFinite(target.y)) continue;
    const dx = target.x - originX;
    const dy = target.y - originY;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < nearestDistanceSq) {
      nearest = target;
      nearestDistanceSq = distanceSq;
    }
  }

  if (!nearest) {
    out.x = 0;
    out.y = 0;
    return false;
  }

  const dx = nearest.x - originX;
  const dy = nearest.y - originY;
  const length = Math.hypot(dx, dy);
  // Tam üst üste binmiş hedefte deterministik sağ yön yedeği; ateş girdisi
  // boşa gitmez ve NaN mermi hızı üretilmez.
  if (!Number.isFinite(length) || length <= 0.0001) {
    out.x = 1;
    out.y = 0;
    return true;
  }
  out.x = dx / length;
  out.y = dy / length;
  return true;
}
