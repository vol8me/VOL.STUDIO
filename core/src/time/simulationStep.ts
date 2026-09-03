import { TECH } from '../constants';

/**
 * Bir karenin SİMÜLASYONA verilecek süresini kelepçeler.
 *
 * Sekme değişimi, uyku, hata ayıklayıcı duraklaması ya da mobil resume sonrası
 * `deltaMs` saniyeler mertebesine çıkar. Kelepçesiz bırakıldığında sistem
 * "hızlanmaz", TUTARSIZLAŞIR: her alt sistem o kareyi kendi kelepçesiyle
 * yorumlar ve aynı karede farklı kadar zaman yaşarlar.
 *
 * Bu gerçekten oldu ve görünür bir hataydı: gövde kendi içinde 100 ms'e
 * kelepçeliyor, yürüyüş döngüsü kelepçelemiyordu. 500 ms'lik tek bir karede
 * gövde 100 ms yol alıyor, ayak döngüsü 500 ms ilerliyordu — ayaklar gövdenin
 * GİTMEDİĞİ yere basıyordu.
 *
 * Bu yüzden tavan tek bir yerde yaşar (`TECH.MAX_SIM_STEP_MS`) ve zamanı
 * tüketen her şey — yaylar, bekleme sayaçları, yürüyüş döngüsü, gövde
 * entegrasyonu — aynı tavanı okur. Kelepçe idempotenttir: kelepçelenmiş bir
 * değeri yeniden kelepçelemek onu değiştirmez, yani hem çağıran hem alt sistem
 * güvenle uygulayabilir.
 *
 * SUNUM deltası ayrıdır ve kelepçelenmez: bir izin sönmesi ya da kameranın
 * yumuşaması gerçek geçen zamanı izlemelidir, aksi halde uzun bir donmadan
 * sonra ekranda asılı kalırlar.
 *
 * @param deltaMs Ham kare süresi (ms).
 * @returns `[0, TECH.MAX_SIM_STEP_MS]` aralığında sonlu bir süre; geçersiz
 *   girdide 0 (yani "bu karede zaman ilerlemedi").
 */
export function clampSimulationStep(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs, TECH.MAX_SIM_STEP_MS);
}
