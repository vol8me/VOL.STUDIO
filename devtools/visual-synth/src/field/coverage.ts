/**
 * Alan → kapsama çevrimi — §5.8'in tek uygulandığı yer.
 *
 * `source`, `mask` ve `height` alanlarının hepsi 0..1 kapsama üretmelidir,
 * ama SDF'ler işaretli mesafe döndürür. Hangi dönüşümün uygulanacağı düğüm
 * türünden STATİK olarak türetilir (bkz. `schema.ts` etki alanı kuralları);
 * çalışma anında değer "mesafeye benziyor mu" diye yoklanmaz.
 */

import { clamp01 } from '@volstudio/core/math/interpolation';
import { resolveFieldDomain } from '../schema';
import type { FieldNode } from '../types';
import type { FieldFn } from './fn';
import type { UnitSpace } from './space';

/**
 * - `unit` alan zaten kapsamadır, kelepçelenir.
 * - `signed` alan eşikten geçer:
 *   - `antialias: false` → `d <= 0 ? 1 : 0`. Keskin piksel.
 *   - `antialias: true`  → yarım piksel genişliğinde yumuşak geçiş. Genişlik
 *     BİRİM UZAYDA SABİT OLAMAZ: 1024²'de yumuşak olan bir genişlik 32²'de
 *     şeklin tamamını yutar, bu yüzden piksel boyutundan türetilir.
 *
 * `antialias`ın tüm varlık sebebi çözünürlüğe bağlı kenar davranışıdır;
 * piksel biriminin buraya sızması D2'ye aykırı değil, D2'nin kendisidir.
 */
export function toCoverageFn(
  field: FieldFn,
  node: FieldNode,
  space: UnitSpace,
  antialias: boolean,
): FieldFn {
  if (resolveFieldDomain(node) === 'unit') {
    return (x, y) => clamp01(field(x, y));
  }
  if (!antialias) {
    return (x, y) => (field(x, y) <= 0 ? 1 : 0);
  }
  const half = space.pixelUnit / 2;
  const span = 1 / (2 * half);
  return (x, y) => {
    const t = clamp01((field(x, y) + half) * span);
    // Azalan yumuşatma: mesafe −half iken 1 (tam içeride), +half iken 0.
    return 1 - t * t * (3 - 2 * t);
  };
}
