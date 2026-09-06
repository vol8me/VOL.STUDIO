import { clamp } from './interpolation';
import { finiteOr, requireFinite } from './numeric';

export interface TwoBoneIkResult {
  /** Kök eklemden diz eklemine bakan açı (radyan). */
  upperRad: number;
  /** Dizden uç noktaya bakan açı (radyan). */
  lowerRad: number;
  /** Hedef erişilemedi mi (uzuv tam gerildi ya da tamamen katlandı). */
  clamped: boolean;
}

/**
 * İki kemikli düzlemsel ters kinematik (kosinüs teoremi). Hedef erişim
 * dışındaysa mesafe KELEPÇELENİR ve uzuv gerilir — hedefin bir karede
 * fırlaması pozu NaN'e düşürmez.
 *
 * Sözleşme `math/numeric.ts` politikasını izler: kemik uzunlukları ve büküm
 * yönü YAPILANDIRMADIR (reddedilir), hedef vektörü AKIŞTIR (yok sayılır).
 *
 * @param bendSign Dizin büküm yönü (+1/-1). Ayna simetrik uzuvlar ZIT işaret
 *   alır, aksi halde bir taraf ters bükülür.
 */
export function solveTwoBoneIk(
  dx: number,
  dy: number,
  upperLength: number,
  lowerLength: number,
  bendSign: number,
): TwoBoneIkResult {
  requireFinite(upperLength, 'solveTwoBoneIk.upperLength');
  requireFinite(lowerLength, 'solveTwoBoneIk.lowerLength');
  requireFinite(bendSign, 'solveTwoBoneIk.bendSign');
  if (upperLength <= 0 || lowerLength <= 0) {
    throw new RangeError(
      `solveTwoBoneIk: kemik uzunlukları pozitif olmalı ` +
        `(gelen: ${upperLength}, ${lowerLength})`,
    );
  }

  const targetX = finiteOr(dx, 0);
  const targetY = finiteOr(dy, 0);
  const toTarget = Math.atan2(targetY, targetX);
  const raw = Math.hypot(targetX, targetY);

  /*
   * Uçlarda `acos` girdisi ±1'e dayanır; pay sayısal gürültüyü dışarıda tutar.
   * SABİT bir pay olamaz: 1e-4, çok kısa kemiklerde alt sınırı üstün ÜZERİNE
   * çıkarır ve `clamp` negatif erişim döndürürdü. Pay aralığın kendisinden
   * türer ve yarısını aşmaz.
   */
  const lo = Math.abs(upperLength - lowerLength);
  const hi = upperLength + lowerLength;
  const margin = Math.min((hi - lo) / 2, 1e-4);
  const reach = Math.max(clamp(raw, lo + margin, hi - margin), Number.EPSILON);

  const cosKneeOffset =
    (reach * reach + upperLength * upperLength - lowerLength * lowerLength) /
    (2 * reach * upperLength);
  const kneeOffset = Math.acos(clamp(cosKneeOffset, -1, 1));

  const sign = bendSign >= 0 ? 1 : -1;
  const upperRad = toTarget + kneeOffset * sign;
  const kneeX = Math.cos(upperRad) * upperLength;
  const kneeY = Math.sin(upperRad) * upperLength;
  const lowerRad = Math.atan2(targetY - kneeY, targetX - kneeX);

  return { upperRad, lowerRad, clamped: raw !== reach };
}
