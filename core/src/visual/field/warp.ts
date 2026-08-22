/**
 * Bozma (warp) — §4.2'nin organik ucu: mermer, duman, damar, akıntı.
 *
 * D4'ün özel durumu: bozma miktarı BAŞKA bir alandan gelir, o alan önce
 * tampona yazılır ve buradan örneklenir. Saf fonksiyon olarak yazılamamasının
 * sebebi budur — örnekleme tampon gerektirir.
 */

import type { FieldFn } from './fn';
import { createBufferSampler, type EdgeMode, type SampleMode } from './sample';
import type { FieldBuffer } from './buffer';
import type { UnitSpace } from './space';

/**
 * Tek skaler alandan İKİ eksenlik kayma.
 *
 * İkinci bileşen, alanın 90° DÖNDÜRÜLMÜŞ hâlinden okunur: `(x, y)` yerine
 * `(−y, x)`. Aynı örneği iki eksende kullanmak çapraz çizgilenme üretir
 * (kayma her yerde 45°'dir); ikinci bir tampon ayırmak ise bellek bütçesini
 * (D7) katmanın kendisi kadar büyütürdü. Döndürülmüş örnek bu ikisinin
 * arasındaki ucuz ve yeterince bağımsız çözümdür.
 *
 * Kayma BİRİM uzaydadır (`amount`), yani çözünürlükten bağımsızdır.
 */
export function createWarpField(
  byBuffer: FieldBuffer,
  input: FieldFn,
  space: UnitSpace,
  amount: number,
  mode: SampleMode,
  edge: EdgeMode,
): FieldFn {
  const sample = createBufferSampler(byBuffer, space, mode, edge);
  const gain = 2 * amount;

  return (x, y) => {
    const dx = (sample(x, y) - 0.5) * gain;
    const dy = (sample(-y, x) - 0.5) * gain;
    return input(x + dx, y + dy);
  };
}
