/**
 * Yükseklik eşitleme ve tavan.
 *
 * `normalize()` TEPEYE göre çalışır ve bu, parçaları eşit yükseklikte YAPMAZ:
 * vurmalı bir doku ile sürekli bir doku aynı tepede çalarken aralarında 10
 * dB'lik duyulur bir fark kalır (ölçüldü — klavsen −27,4 dB, org −16,9 dB
 * ortalama, ikisi de tepede −1 dB). Art arda çalınan parçalarda bu, ses
 * düğmesine uzanmak demektir.
 */

/** Kare ortalamanın karekökü — algılanan yüksekliğin ucuz ve kararlı ölçüsü. */
export function measureRms(channels: readonly Float32Array[]): number {
  let energy = 0;
  let count = 0;
  for (const channel of channels) {
    for (const value of channel) {
      if (!Number.isFinite(value)) continue;
      energy += value * value;
      count++;
    }
  }
  return count === 0 ? 0 : Math.sqrt(energy / count);
}

/** Tepe genlik. */
export function measurePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (const value of channel) {
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
  }
  return peak;
}

/**
 * Diz bölgeli yumuşak sınırlayıcı.
 *
 * `threshold` altında sinyale DOKUNMAZ; üstünde sıkıştırır ve hiçbir zaman
 * `threshold + knee` değerini aşmaz. Sert kırpma yerine bu seçilir: kırpma
 * tek örnekte süreksizlik üretir ve tüm harmoniklere yayılan bir cızırtı
 * bırakır.
 */
export function softLimit(value: number, threshold = 0.7, knee = 0.28): number {
  const magnitude = Math.abs(value);
  if (magnitude <= threshold) return value;
  const over = magnitude - threshold;
  return Math.sign(value) * (threshold + over / (1 + over / knee));
}

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
  const targetRms = options.targetRms ?? 0.1;
  const threshold = options.threshold ?? 0.7;
  const ceiling = options.ceiling ?? 0.95;
  const maxGain = options.maxGain ?? 6;

  const rms = measureRms(channels);
  if (targetRms > 0 && rms > 0) {
    const gain = Math.min(maxGain, targetRms / rms);
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i] *= gain;
    }
  }

  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) channel[i] = softLimit(channel[i], threshold);
  }

  const peak = measurePeak(channels);
  if (peak > ceiling) {
    const scale = ceiling / peak;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) channel[i] *= scale;
    }
  }
}
