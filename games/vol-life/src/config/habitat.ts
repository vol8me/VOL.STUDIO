import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

/**
 * Void içindeki yaşanabilir habitatın geometrisi (DESIGN.md §2). Depolama
 * dikdörtgeni dünya değildir; bu değerler onun içindeki organik konturu kurar.
 */
export interface HabitatConfig {
  /** Yatay yarıçapın depolama yarı genişliğine oranı. */
  readonly radiusRatioX: number;
  /** Dikey yarıçapın depolama yarı yüksekliğine oranı. */
  readonly radiusRatioY: number;
  /** Superellipse üssü; 2 elips, büyüdükçe köşeler dolar. */
  readonly superellipseExponent: number;
  /** Kontur harmoniklerinin toplam genlik tavanı, yarıçapa oran. */
  readonly noiseAmplitudeRatio: number;
  /** Konturu bozan en düşük ve en yüksek açısal harmonik. */
  readonly noiseHarmonicMin: number;
  readonly noiseHarmonicMax: number;
  /** Kontur ile depolama kenarı arasında zorunlu boşluk. */
  readonly storageMarginUnits: number;
  /** Kamera gezinme alanının habitat kutusuna eklediği Void payı, kutu boyutuna oran. */
  readonly cameraVoidMarginRatio: number;
}

export const habitatConfig: HabitatConfig = {
  radiusRatioX: 0.82,
  radiusRatioY: 0.74,
  superellipseExponent: 2.6,
  noiseAmplitudeRatio: 0.06,
  noiseHarmonicMin: 2,
  noiseHarmonicMax: 5,
  storageMarginUnits: 48,
  cameraVoidMarginRatio: 0.15,
};

export function cloneHabitatConfig(config: HabitatConfig): HabitatConfig {
  return { ...config };
}

export function validateHabitatConfig(config: HabitatConfig): void {
  assertFiniteRange(config.radiusRatioX, 0.2, 0.98, 'Habitat yatay yarıçap oranı');
  assertFiniteRange(config.radiusRatioY, 0.2, 0.98, 'Habitat dikey yarıçap oranı');
  assertFiniteRange(config.superellipseExponent, 1.5, 8, 'Superellipse üssü');
  assertFiniteRange(config.noiseAmplitudeRatio, 0, 0.15, 'Kontur gürültü genliği');
  assertPositiveInteger(config.noiseHarmonicMin, 'En düşük kontur harmoniği');
  assertPositiveInteger(config.noiseHarmonicMax, 'En yüksek kontur harmoniği');
  if (config.noiseHarmonicMin < 2 || config.noiseHarmonicMax < config.noiseHarmonicMin) {
    throw new RangeError('Kontur harmonikleri 2 ile başlayan artan bir aralık olmalı.');
  }
  if (config.noiseHarmonicMax > 8) {
    throw new RangeError('Yüksek kontur harmoniği cep ve yıldız biçimi üretir (DESIGN §2).');
  }
  assertPositiveFinite(config.storageMarginUnits, 'Depolama kenar boşluğu');
  assertFiniteRange(config.cameraVoidMarginRatio, 0.05, 0.5, 'Kamera Void payı');
}
