/** Tile kare engeli mi? Dünya dışı tile'lar çağıranın tanımına göre engeldir. */
export type BlockedTile = (tileX: number, tileY: number) => boolean;

export interface MovedPosition {
  x: number;
  y: number;
}

/**
 * Daire ile engel tile karelerinin kesişimi: dairenin kapladığı tile'larda, daireye en yakın kare noktası
 * yarıçap içindeyse çarpışır. Yalnız toplama, çarpma ve karşılaştırma kullanır (kare kök yok), bu yüzden
 * her JS motorunda bit özdeş sonuç verir.
 */
export function circleHitsBlocked(
  blocked: BlockedTile,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const x0 = Math.floor(centerX - radius);
  const x1 = Math.floor(centerX + radius);
  const y0 = Math.floor(centerY - radius);
  const y1 = Math.floor(centerY + radius);
  const radiusSq = radius * radius;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!blocked(tx, ty)) continue;
      const nearestX = centerX < tx ? tx : centerX > tx + 1 ? tx + 1 : centerX;
      const nearestY = centerY < ty ? ty : centerY > ty + 1 ? ty + 1 : centerY;
      const ex = centerX - nearestX;
      const ey = centerY - nearestY;
      if (ex * ex + ey * ey < radiusSq) return true;
    }
  }
  return false;
}

/**
 * Daireyi (dx, dy) kadar eksen eksen ilerletir: önce x, sonra y; engelli eksen yerinde kalır, böylece
 * duvar boyunca kayar. Sim ve görünümdeki kendi-tank öngörüsü aynı işlevi kullanır; görünüm duvara
 * sürüp geri sıçramaz.
 */
export function moveCircle(
  blocked: BlockedTile,
  x: number,
  y: number,
  dx: number,
  dy: number,
  radius: number,
  out: MovedPosition,
): void {
  let nextX = x + dx;
  if (circleHitsBlocked(blocked, nextX, y, radius)) nextX = x;
  let nextY = y + dy;
  if (circleHitsBlocked(blocked, nextX, nextY, radius)) nextY = y;
  out.x = nextX;
  out.y = nextY;
}
