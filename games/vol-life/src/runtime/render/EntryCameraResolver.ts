import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';

export interface EntryCameraTarget {
  readonly x: number;
  readonly y: number;
  /** Odağı üreten aktif madde sayısı; sıfırsa habitat merkezine düşülmüştür. */
  readonly sampleCount: number;
}

export interface EntryCameraOptions {
  /** Hücre boyu; yoğunluk bu ızgarada sayılır. */
  readonly cellUnits: number;
  /** Odak bu kadar kıyıdan içeride tutulur. */
  readonly safeMarginUnits: number;
}

/**
 * Açılış odağı (D2). SAF ve DETERMİNİSTİK: aynı parçacık durumu her zaman aynı
 * noktayı verir.
 *
 * Odak, yoğunluk ağırlıklı aktif madde merkezidir — basit ortalama, birbirinden
 * uzak iki kümenin ARASINDAKİ boşluğu gösterirdi. En yoğun hücre seçilir ve
 * merkez o hücrenin üyelerinden çıkar. Eşitlikte sıra deterministiktir (önce
 * hücre y, sonra x), yoksa aynı dünya farklı açılışlar üretirdi.
 */
export function resolveEntryCamera(
  particles: ParticleStore,
  domain: WorldDomain,
  options: EntryCameraOptions,
): EntryCameraTarget {
  if (!(options.cellUnits > 0)) throw new RangeError('Hücre boyu pozitif olmalı.');
  const counts = new Map<
    string,
    { count: number; sumX: number; sumY: number; cellX: number; cellY: number }
  >();
  for (let slot = 0; slot < particles.capacity; slot++) {
    if (particles.active[slot] === 0) continue;
    const cellX = Math.floor(particles.x[slot] / options.cellUnits);
    const cellY = Math.floor(particles.y[slot] / options.cellUnits);
    const key = `${cellX}:${cellY}`;
    const bucket = counts.get(key) ?? { count: 0, sumX: 0, sumY: 0, cellX, cellY };
    bucket.count++;
    bucket.sumX += particles.x[slot];
    bucket.sumY += particles.y[slot];
    counts.set(key, bucket);
  }

  if (counts.size === 0) {
    const center = domainCenter(domain);
    return { x: center.x, y: center.y, sampleCount: 0 };
  }

  let best = [...counts.values()][0];
  for (const bucket of counts.values()) {
    if (bucket.count > best.count) {
      best = bucket;
      continue;
    }
    // Eşitlikte deterministik sıra: önce küçük hücre y, sonra küçük hücre x.
    if (bucket.count === best.count) {
      if (bucket.cellY < best.cellY || (bucket.cellY === best.cellY && bucket.cellX < best.cellX)) {
        best = bucket;
      }
    }
  }

  const focus = { x: best.sumX / best.count, y: best.sumY / best.count };
  return {
    ...clampToSafeInterior(focus, domain, options.safeMarginUnits),
    sampleCount: best.count,
  };
}

function domainCenter(domain: WorldDomain): { x: number; y: number } {
  return {
    x: domain.bbox.x + domain.bbox.width / 2,
    y: domain.bbox.y + domain.bbox.height / 2,
  };
}

/**
 * Odak güvenli iç bölgeye çekilir: kıyıya yapışmış bir odak, açılışta ekranın
 * yarısını Void yapardı. Normal boyunca içeri yürünür.
 */
function clampToSafeInterior(
  focus: { x: number; y: number },
  domain: WorldDomain,
  safeMarginUnits: number,
): { x: number; y: number } {
  const sample = domain.sampleDistanceAndNormal(focus.x, focus.y);
  if (sample.distance >= safeMarginUnits) return focus;
  const step = safeMarginUnits - sample.distance;
  return { x: focus.x - sample.normalX * step, y: focus.y - sample.normalY * step };
}
