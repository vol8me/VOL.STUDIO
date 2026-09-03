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
 * İki kemikli (kök → diz → uç) düzlemsel ters kinematik — kosinüs teoremi.
 *
 * Hedef erişim dışındaysa çözüm YOK sayılmaz: mesafe erişilebilir aralığa
 * kelepçelenir ve uzuv hedefe doğru tam gerilir (ya da katlanır). Böylece bir
 * kare içinde hedefin fırlaması uzvu NaN'e düşürmez, sadece gerdirir.
 *
 * Giriş sözleşmesi CORE'un ortak politikasını izler (bkz. `math/numeric.ts`):
 * kemik uzunlukları ve büküm yönü YAPILANDIRMADIR ve reddedilir — bozuk bir
 * kemik uzunluğu çağıranın hatasıdır ve sessizce düzeltilirse uzvun neden
 * yanlış durduğu kaynağından çok uzakta aranır. Hedef vektörü ise AKIŞ
 * değeridir ve yok sayılır: tek bir bozuk kare yüzünden pozu fırlatmak
 * orantısız olurdu.
 *
 * @param dx Kökten hedefe vektörün x bileşeni (akış; sonlu değilse 0).
 * @param dy Kökten hedefe vektörün y bileşeni (akış; sonlu değilse 0).
 * @param upperLength Kök–diz kemik uzunluğu; sonlu ve POZİTİF olmalı.
 * @param lowerLength Diz–uç kemik uzunluğu; sonlu ve POZİTİF olmalı.
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
   * Erişim aralığı ve KENDİ payı.
   *
   * Tam gerili ve tam katlanmış uçlarda `acos` girdisi ±1'e dayanır; küçük bir
   * pay sayısal gürültünün oraya taşmasını engeller. Pay SABİT olamaz: 1e-4'lük
   * bir sabit, iki kemiği de 5e-5 uzunluğunda olan bir uzuvda alt sınırı üst
   * sınırın ÜSTÜNE çıkarır ve `clamp` negatif bir erişim döndürürdü — çözüm
   * sessizce anlamsız olurdu. Pay bu yüzden aralığın kendisinden türetilir ve
   * hiçbir zaman aralığın yarısını aşmaz.
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
