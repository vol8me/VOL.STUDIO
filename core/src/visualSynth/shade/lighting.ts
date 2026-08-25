/**
 * Işıklandırma — §4.5'in `lambert` ve `rim` satırları.
 *
 * Gölge tek bir ışıktan gelir ve TÜM malzemeler onu paylaşır. D3'ün
 * "çok renkli obje, tek ve tutarlı ışık" iddiasının teknik karşılığı budur:
 * gövde ile yaprak farklı rampalarda ama gölgeleri aynı hesaptan çıkar.
 */

import { clamp01 } from '../../math/interpolation';
import type { NormalChannel } from './normal';

/**
 * Kenar ışığı üssü.
 *
 * Parametre değil sabit: `rim` zaten bir ŞİDDET taşıyor ve üssü de açmak,
 * ikisi birlikte ayarlanmadıkça anlamsız sonuç veren iki kaydırıcı demekti.
 * Üç, silüeti ayıracak kadar dar bir bant verir.
 */
const RIM_POWER = 3;

export interface LightingOptions {
  /** Işık yönü; normalize edilir. */
  readonly light: readonly [number, number, number];
  readonly strength: number;
  readonly ambient: number;
  readonly rim: number;
}

/** Normal alanından gölge üretir; sonuç 0..1. */
export function computeShade(
  normals: NormalChannel,
  count: number,
  options: LightingOptions,
): Float32Array {
  const [lx, ly, lz] = options.light;
  const length = Math.hypot(lx, ly, lz) || 1;
  const nx = lx / length;
  const ny = ly / length;
  const nz = lz / length;

  const shade = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const diffuse = Math.max(0, normals.x[i] * nx + normals.y[i] * ny + normals.z[i] * nz);
    // Bakış yönü (0, 0, 1): silüete yaklaştıkça normalin z'si düşer ve kenar
    // ışığı yükselir. Ayrı bir kamera vektörü YOKTUR — çıktı ortografiktir.
    const facing = clamp01(1 - normals.z[i]);
    shade[i] = clamp01(
      options.ambient + options.strength * diffuse + options.rim * Math.pow(facing, RIM_POWER),
    );
  }
  return shade;
}
