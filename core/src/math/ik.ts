import { clamp } from './interpolation';

export interface TwoBoneIkResult {
  /** Kök eklemden diz eklemine bakan açı (radyan). */
  upperRad: number;
  /** Dizden uç noktaya bakan açı (radyan). */
  lowerRad: number;
  /** Hedef erişilemedi mi (uzuv tam gerildi ya da tamamen katlandı). */
  clamped: boolean;
}

/**
 * İki kemikli (kök → diz → uç) düzlemsel ters kinematik — kosinüs teoremi.
 *
 * Hedef erişim dışındaysa çözüm YOK sayılmaz: mesafe erişilebilir aralığa
 * kelepçelenir ve uzuv hedefe doğru tam gerilir (ya da katlanır). Böylece bir
 * kare içinde hedefin fırlaması uzvu NaN'e düşürmez, sadece gerdirir.
 *
 * @param dx Kökten hedefe vektörün x bileşeni.
 * @param dy Kökten hedefe vektörün y bileşeni.
 * @param upperLength Kök–diz kemik uzunluğu.
 * @param lowerLength Diz–uç kemik uzunluğu.
 * @param bendSign Dizin hangi tarafa büküleceği (+1/-1). Ayna simetrik uzuvlar
 *   zıt işaret alır, aksi halde bir taraf ters bükülür.
 */
export function solveTwoBoneIk(
  dx: number,
  dy: number,
  upperLength: number,
  lowerLength: number,
  bendSign: number,
): TwoBoneIkResult {
  const toTarget = Math.atan2(dy, dx);
  const raw = Math.hypot(dx, dy);
  const min = Math.abs(upperLength - lowerLength) + 1e-4;
  const max = upperLength + lowerLength - 1e-4;
  const reach = clamp(raw, min, max);

  const cosKneeOffset =
    (reach * reach + upperLength * upperLength - lowerLength * lowerLength) /
    (2 * reach * upperLength);
  const kneeOffset = Math.acos(clamp(cosKneeOffset, -1, 1));

  const sign = bendSign >= 0 ? 1 : -1;
  const upperRad = toTarget + kneeOffset * sign;
  const kneeX = Math.cos(upperRad) * upperLength;
  const kneeY = Math.sin(upperRad) * upperLength;
  const lowerRad = Math.atan2(dy - kneeY, dx - kneeX);

  return { upperRad, lowerRad, clamped: raw !== reach };
}
