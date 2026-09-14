import type { Rect } from '@volstudio/core';
import { assertFiniteRange, assertPositiveFinite, assertPositiveInteger } from './validation';

/**
 * Dünyanın ölçüleri. Bir dengeleme değişikliği çalışma zamanı dosyasına
 * dokunmamalıdır (AGENTS Kural 5).
 */
export interface WorldConfig {
  /**
   * Alan ızgarası ve spatial hash için DEPOLAMA dikdörtgeni. Fiziksel dünya
   * bunun içindeki `HabitatSDF`dir (DESIGN.md §2); bu kutu duvar değildir.
   */
  readonly boundsUnits: Readonly<Rect>;
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

export function cloneWorldConfig(config: WorldConfig): WorldConfig {
  return { ...config, boundsUnits: { ...config.boundsUnits } };
}

export function resolveSimulationHz(fixedStepMs: number): number {
  const hz = 1000 / fixedStepMs;
  const rounded = Math.round(hz);
  if (
    !(fixedStepMs > 0) ||
    !Number.isFinite(fixedStepMs) ||
    !Number.isSafeInteger(rounded) ||
    rounded < 1 ||
    Math.abs(hz - rounded) > 1e-9
  ) {
    throw new RangeError(`Sabit adım tam sayı bir simülasyon temposu üretmeli: ${fixedStepMs}`);
  }
  return rounded;
}

export function validateWorldConfig(config: WorldConfig): void {
  const simulationHz = resolveSimulationHz(config.fixedStepMs);
  assertPositiveInteger(config.maxStepsPerFrame, 'Kare başına adım tavanı');
  if (!isPowerOfTwo(config.fieldResolution)) {
    throw new RangeError('Alan çözünürlüğü en az iki ve ikinin kuvveti olmalı.');
  }
  assertPositiveInteger(config.fieldHz, 'Alan temposu');
  if (simulationHz % config.fieldHz !== 0) {
    throw new RangeError('Alan temposu simülasyon temposunu tam bölmeli.');
  }
  assertPositiveInteger(config.fieldUpdateBands, 'Alan bant sayısı');
  if (config.fieldResolution % config.fieldUpdateBands !== 0) {
    throw new RangeError('Alan bant sayısı çözünürlüğü tam bölmeli.');
  }
  assertPositiveInteger(config.lightSourceCount, 'Işık kaynağı sayısı');
  assertPositiveFinite(config.lightSourceRadiusUnits, 'Işık yarıçapı');
  assertFiniteRange(config.lightSourceDriftUnits, 0, Number.MAX_VALUE, 'Işık sürüklenmesi');
  assertFiniteRange(config.nutrientDiffusion, 0, 0.25, 'Besin difüzyonu');
  assertFiniteRange(config.nutrientRenewal, 0, 1, 'Besin yenilenmesi');
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;
}

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
