/**
 * Alan-uzayı işlemleri — §4.2. **Genelliğin kaynağı buradadır.**
 *
 * Hepsi TERS EŞLEME uygular (D4, §5.7): çıktı pikselinden girdiye gidilir.
 * İleri eşleme (girdiden çıktıya) çıktıda boşluk bırakır — döndürülen bir
 * daire delikli çıkar. Ters eşlemede her çıktı pikseli tam olarak bir kez
 * ve tam olarak bir girdi noktasından okunur.
 *
 * Zincirleme kapanışla yapılır: `rotate(translate(source))` çağrıldığında
 * önce `rotate`ın tersi, sonra `translate`in tersi uygulanır — yani zincir
 * ters sırada çalışır, §5.7'nin istediği tam olarak budur. Ayrı bir sıra
 * yönetimi yoktur; iç içe geçme sırayı zaten verir.
 *
 * Ara raster YOKTUR: dönüşümler tamdır, yeniden örnekleme bulanıklığı
 * oluşmaz. Piksel sanatında bu belirleyicidir.
 */

import type { FieldFn } from './fn';

/** Öteleme; tersi karşı yöne kaydırmadır. */
export function translateInverse(x0: number, y0: number, input: FieldFn): FieldFn {
  return (x, y) => input(x - x0, y - y0);
}

/**
 * Döndürme; tersi `-angle` ile döndürmedir.
 *
 * +y aşağı olduğu için (bkz. `space.ts`) pozitif açı görsel olarak saat
 * yönündedir. Kosinüs/sinüs derleme anında bir kez hesaplanır.
 */
export function rotateInverse(angleRad: number, cx: number, cy: number, input: FieldFn): FieldFn {
  const c = Math.cos(-angleRad);
  const s = Math.sin(-angleRad);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return input(cx + dx * c - dy * s, cy + dx * s + dy * c);
  };
}

/**
 * Ölçekleme; tersi bölmedir. Bileşenler ayrı olduğu için anizotropiktir.
 *
 * Sıfır ölçek doğrulamada reddedilir (`nonZero`); buraya sıfır gelmez.
 *
 * **Ölçeklenmiş bir SDF artık gerçek mesafe alanı değildir.** Koordinat
 * bölündüğü için geometri büyür ama dönen DEĞER kaynağın mesafesi kalır;
 * sonuç bir üst sınırdır (Lipschitz sabiti bozulur). Kapsama eşiği bundan
 * etkilenmez — işaret doğrudur — ama mesafeyi UZUNLUK olarak okuyan
 * işlemler (dış çizgi kalınlığı, mesafe dönüşümü; Tur 2–3) ölçekli bir
 * alanda beklenenden ince/kalın sonuç verir. O turlarda değer `min(sx, sy)`
 * ile yeniden ölçeklenmeli ya da eşik öncesi normalize edilmelidir.
 */
export function scaleInverse(
  sx: number,
  sy: number,
  cx: number,
  cy: number,
  input: FieldFn,
): FieldFn {
  const ix = 1 / sx;
  const iy = 1 / sy;
  return (x, y) => input(cx + (x - cx) * ix, cy + (y - cy) * iy);
}
