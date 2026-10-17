import { TECH } from '../constants';

/**
 * Bir karenin SİMÜLASYONA verilecek süresini kelepçeler.
 *
 * Sekme değişimi, uyku ya da mobil resume sonrası `deltaMs` saniyeler
 * mertebesine çıkar. Alt sistemler kendi kelepçelerini uygularsa sistem
 * hızlanmaz, TUTARSIZLAŞIR: aynı karede farklı kadar zaman yaşarlar.
 *
 * Bu yüzden tavan tek yerde (`TECH.MAX_SIM_STEP_MS`) yaşar ve zamanı tüketen
 * her şey onu okur. Kelepçe idempotenttir; hem çağıran hem alt sistem güvenle
 * uygulayabilir.
 *
 * SUNUM deltası ayrıdır ve kelepçelenmez: bir izin sönmesi ya da kameranın
 * yumuşaması gerçek geçen zamanı izlemelidir.
 *
 * @param deltaMs Ham kare süresi (ms).
 * @returns `[0, TECH.MAX_SIM_STEP_MS]` aralığında sonlu bir süre; geçersiz
 *   girdide 0 (yani "bu karede zaman ilerlemedi").
 */
export function clampSimulationStep(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs, TECH.MAX_SIM_STEP_MS);
}
