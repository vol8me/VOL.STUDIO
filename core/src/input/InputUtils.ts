import { Vector2 } from '../math/Vector2';
import { INPUT } from '../constants';

/**
 * Yalnızca yön gerektiren inputları (sağ joystick vb.) normalize eder; çıktı uzunluğu her zaman 0 ya da 1.
 */
export function normalizeDirection(
  v: Vector2,
  // Tipler AÇIKÇA yazılır: `INPUT` bir `as const` nesnesi olduğu için
  // `INPUT.DEAD_ZONE_RATIO`nun tipi `number` değil `0.15` literalidir.
  // Anotasyon olmadan parametre o literale daralır ve "ayarlanabilir"
  // deadzone 0.15 dışında hiçbir değeri kabul etmez.
  deadZone: number = INPUT.DEAD_ZONE_RATIO,
  maxRadius: number = 1.0,
): Vector2 {
  const len = v.length();
  if (len <= 0 || len / maxRadius < deadZone) {
    return Vector2.zero();
  }

  return v.scale(1 / len);
}

/**
 * Hem yön hem büyüklük taşıyan inputları (sol joystick / WASD) 0..1 aralığına çeker;
 * deadZone sonrası büyüklük yeniden 0..1'e eşlenir.
 */
export function normalizeAnalog(
  v: Vector2,
  // bkz. normalizeDirection — literal daralmasını önleyen açık anotasyon.
  deadZone: number = INPUT.DEAD_ZONE_RATIO,
  maxRadius: number = 1.0,
): Vector2 {
  const len = v.length();
  if (len <= 0) {
    return Vector2.zero();
  }

  const ratio = Math.min(len / maxRadius, 1);
  if (ratio < deadZone) {
    return Vector2.zero();
  }

  const magnitude = (ratio - deadZone) / (1 - deadZone);
  return v.scale(magnitude / len);
}
