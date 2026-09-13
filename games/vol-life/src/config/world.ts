import type { Rect } from '@volstudio/core';

/**
 * Dünyanın ölçüleri. Bir dengeleme değişikliği çalışma zamanı dosyasına
 * dokunmamalıdır (AGENTS Kural 5).
 */
export interface WorldConfig {
  /** Parçacıkların ve alanların fiziksel dünya sınırı. */
  readonly boundsUnits: Readonly<Rect>;
  /** Parçacık çarpışma düzleminin dünya dış sınırından uzaklığı. */
  readonly particleCollisionInsetUnits: number;
  /** Sabit simülasyon adımı. */
  readonly fixedStepMs: number;
  /**
   * Bir render karesinde koşulabilecek azami sabit adım.
   *
   * Yüksek bir tavan ÖLÜM SARMALI üretir: kare bütçesi aşıldığında saat daha
   * çok telafi adımı ister, o adımlar kareyi daha da uzatır ve sistem geri
   * dönemez. Tavan düşük tutulur; simülasyon geri kalırsa yavaşlar, kilitlenmez.
   */
  readonly maxStepsPerFrame: number;
  /** Sürekli alanların kare ızgara çözünürlüğü. */
  readonly fieldResolution: number;
  /** Alan sistemlerinin çalışma temposu. */
  readonly fieldHz: number;
  /** Bir tam alan turunun kaç ardışık güncellemeye bölündüğü. */
  readonly fieldUpdateBands: number;
  /** Tohumdan üretilen, yavaşça kayan ışık kaynağı sayısı. */
  readonly lightSourceCount: number;
  readonly lightSourceRadiusUnits: number;
  readonly lightSourceDriftUnits: number;
  readonly nutrientDiffusion: number;
  readonly nutrientRenewal: number;
}

export const worldConfig: WorldConfig = {
  boundsUnits: { x: 0, y: 0, width: 1024, height: 1024 },
  particleCollisionInsetUnits: 6,
  fixedStepMs: 1000 / 60,
  maxStepsPerFrame: 2,
  fieldResolution: 256,
  fieldHz: 10,
  fieldUpdateBands: 1,
  lightSourceCount: 5,
  lightSourceRadiusUnits: 112,
  lightSourceDriftUnits: 72,
  nutrientDiffusion: 0.12,
  nutrientRenewal: 0.018,
};

/**
 * Tekrar kipinin hız çarpanına (0.5× - 4×) göre kare başına adım tavanı.
 *
 * Canlı dünya hızlandırılmaz ve her zaman taban tavanla koşar (DESIGN.md §1);
 * çarpan yalnız tekrarda anlamlıdır. 1× tabanında 2 adım ölüm sarmalını
 * engellerken 4× tekrarda 8 adıma kadar izin vermek, 30/60 Hz ekranlarda
 * tekrarın geri kalmasını önler.
 */
export function resolveMaxStepsForSpeed(
  multiplier: number,
  baseMaxSteps = worldConfig.maxStepsPerFrame,
): number {
  const safeMultiplier = Math.max(0.5, Math.min(4, Number.isFinite(multiplier) ? multiplier : 1));
  return Math.ceil(baseMaxSteps * safeMultiplier);
}
