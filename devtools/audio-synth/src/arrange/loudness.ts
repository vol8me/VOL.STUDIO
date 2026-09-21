import { masterChannels } from '../engine/master';

/**
 * Yükseklik eşitleme ve tavan.
 *
 * `normalize()` TEPEYE göre çalışır ve bu, parçaları eşit yükseklikte YAPMAZ:
 * vurmalı bir doku ile sürekli bir doku aynı tepede çalarken aralarında 10
 * dB'lik duyulur bir fark kalır (ölçüldü — klavsen −27,4 dB, org −16,9 dB
 * ortalama, ikisi de tepede −1 dB). Art arda çalınan parçalarda bu, ses
 * düğmesine uzanmak demektir.
 */

export { measurePeak, measureRms, softLimit } from '../engine/master';

export interface LoudnessOptions {
  /**
   * Hedef RMS (0-1). 0.1 ≈ −20 dBFS.
   *
   * **Sıfır ya da negatif "eşitleme YAPMA" demektir**, "sustur" değil. Ölçüyü
   * kendi yapan bir çağıran (katmanları elle dengeleyen bir mix gibi) burada
   * ölçeklenmek istemez; 0'ı sadık biçimde uygulamak ise onun sesini yok
   * ederdi. Tavan ve sınırlayıcı yine de çalışır.
   */
  targetRms?: number;
  /** Sınırlayıcının dokunmaya başladığı seviye. */
  threshold?: number;
  /** Sınırlayıcıdan sonra izin verilen en yüksek tepe. */
  ceiling?: number;
  /** Sessiz bir kayıttan gürültü çıkarmamak için en yüksek yükseltme katsayısı. */
  maxGain?: number;
}

/**
 * Kanalları YERİNDE hedef yüksekliğe çeker, sonra tavanı toplar.
 *
 * **Sıra tersine çevrilemez.** Önce sınırlayıp sonra ölçeklemek, sınırlayıcının
 * kazandığı payı geri verir ve tepe yeniden tavanı aşar. Ölçekle-sonra-sınırla
 * sırası, sınırlayıcının son söz sahibi olmasını garanti eder.
 *
 * `maxGain` neden var: neredeyse sessiz bir kayıtta hedef RMS'e ulaşmak için
 * gereken katsayı yüzlerce olabilir ve o katsayı sesi değil zemin gürültüsünü
 * yükseltir.
 */
export function matchLoudness(
  channels: readonly Float32Array[],
  options: LoudnessOptions = {},
): void {
  // Örnek oranı yalnız DC/sönüm süreleri içindir; burada ikisi de yok.
  masterChannels(channels, 1, {
    level: { mode: 'rms', target: options.targetRms ?? 0.1, maxGain: options.maxGain ?? 6 },
    limiter: { threshold: options.threshold ?? 0.7, knee: 0.28 },
    ceiling: options.ceiling ?? 0.95,
  });
}
