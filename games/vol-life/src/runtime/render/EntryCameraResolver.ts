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
 * Odak YOĞUNLUK AĞIRLIKLI aktif madde merkezidir: her parçacık kendi
 * hücresindeki komşu sayısıyla ağırlıklandırılır ve bütün madde toplama girer.
 *
 * "En yoğun hücrenin merkezi" DEĞİLDİR. O uygulama ölçüldüğünde kamera tek bir
 * tohum yamasına çakılıyordu: 1280×720'de merkez (408, 139), maddenin merkezi
 * ise (510, 491); görünür madde payı %8,2'ye düşüyordu. Ağırlıklı merkez dört
 * yamayı da hesaba katar, yoğun bölgeye yaklaşır ama tek yamaya kilitlenmez.
 *
 * Basit ortalama da kullanılmaz: ağırlıksız merkez, birbirinden uzak iki kümenin
 * ARASINDAKİ boşluğu gösterirdi.
 */
export function resolveEntryCamera(
  particles: ParticleStore,
  domain: WorldDomain,
  options: EntryCameraOptions,
): EntryCameraTarget {
  if (!(options.cellUnits > 0)) throw new RangeError('Hücre boyu pozitif olmalı.');
  const cellCounts = new Map<string, number>();
  const slots: number[] = [];
  for (let slot = 0; slot < particles.capacity; slot++) {
    if (particles.active[slot] === 0) continue;
    slots.push(slot);
    const key = cellKey(particles.x[slot], particles.y[slot], options.cellUnits);
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }

  if (slots.length === 0) {
    const center = domainCenter(domain);
    return { x: center.x, y: center.y, sampleCount: 0 };
  }

  /*
   * Ağırlık hücre sayımıdır ve toplama SLOT SIRASINDA yapılır: kayan noktalı
   * toplam sıraya duyarlıdır, sabit sıra determinizmi garanti eder.
   */
  let weightSum = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (const slot of slots) {
    const weight =
      cellCounts.get(cellKey(particles.x[slot], particles.y[slot], options.cellUnits)) ?? 1;
    weightSum += weight;
    weightedX += particles.x[slot] * weight;
    weightedY += particles.y[slot] * weight;
  }

  const focus = { x: weightedX / weightSum, y: weightedY / weightSum };
  return {
    ...clampToSafeInterior(focus, domain, options.safeMarginUnits),
    sampleCount: slots.length,
  };
}

function cellKey(x: number, y: number, cellUnits: number): string {
  return `${Math.floor(x / cellUnits)}:${Math.floor(y / cellUnits)}`;
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
