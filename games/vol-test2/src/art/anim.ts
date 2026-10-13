/**
 * Animasyon verisi: SVG'ler durağan rasterlenir, hareket motorda zamanın saf bir işlevidir.
 * Değer `t` saniyesinde ve `phase` kaymasında hesaplanır; durum tutulmaz, bu yüzden aynı zaman aynı
 * poz verir (deterministik) ve test edilebilir. Birimler: derece, tasarım birimi, 0..1 saydamlık.
 */
export type AnimSpec =
  /** Sabit hızla dönme; değer derecedir (0..360). */
  | { readonly kind: 'spin'; readonly rpm: number }
  /** Orta açı çevresinde salınım; değer derecedir. */
  | {
      readonly kind: 'sweep';
      readonly centerDeg: number;
      readonly amplitudeDeg: number;
      readonly hz: number;
    }
  /** Sinüsle min..max arası nabız (saydamlık ya da ölçek). */
  | { readonly kind: 'pulse'; readonly min: number; readonly max: number; readonly hz: number }
  /** Sabit hızla kayma; değer [0, period) aralığında sarar (periyodik doku için). */
  | { readonly kind: 'scroll'; readonly unitsPerSecond: number; readonly period: number }
  /** Periyodik geri tepme: her `periodMs`te `units` kadar geri gider ve üstel olarak döner. */
  | {
      readonly kind: 'kick';
      readonly units: number;
      readonly periodMs: number;
      readonly decayMs: number;
    }
  /** Periyodik çakma: her `periodMs`te 1'den başlar, `decayMs`te doğrusal sönerek 0'a iner. */
  | { readonly kind: 'flash'; readonly periodMs: number; readonly decayMs: number };

const TAU = Math.PI * 2;

/** Pozitif modül: negatif girdide de [0, m) döner. */
function wrap(value: number, modulus: number): number {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}

/**
 * `spec`in `t` saniyesindeki değeri. `phase` saniye cinsinden zaman kaymasıdır: aynı türden birçok
 * nesne aynı anda aynı pozda olmasın diye nesne başına verilir.
 */
export function animationValue(spec: AnimSpec, t: number, phase = 0): number {
  const time = t + phase;
  switch (spec.kind) {
    case 'spin':
      return wrap(time * spec.rpm * 6, 360);
    case 'sweep':
      return spec.centerDeg + spec.amplitudeDeg * Math.sin(TAU * spec.hz * time);
    case 'pulse':
      return spec.min + (spec.max - spec.min) * (0.5 + 0.5 * Math.sin(TAU * spec.hz * time));
    case 'scroll':
      return wrap(time * spec.unitsPerSecond, spec.period);
    case 'kick': {
      const since = wrap(time * 1000, spec.periodMs);
      return -spec.units * Math.exp(-since / spec.decayMs);
    }
    case 'flash': {
      const since = wrap(time * 1000, spec.periodMs);
      return Math.max(0, 1 - since / spec.decayMs);
    }
  }
}

/** Değerin alabileceği aralık; testler ve görsel bütçe denetimi için. */
export function animationRange(spec: AnimSpec): { readonly min: number; readonly max: number } {
  switch (spec.kind) {
    case 'spin':
      return { min: 0, max: 360 };
    case 'sweep':
      return {
        min: spec.centerDeg - Math.abs(spec.amplitudeDeg),
        max: spec.centerDeg + Math.abs(spec.amplitudeDeg),
      };
    case 'pulse':
      return { min: Math.min(spec.min, spec.max), max: Math.max(spec.min, spec.max) };
    case 'scroll':
      return { min: 0, max: spec.period };
    case 'kick':
      return { min: -Math.abs(spec.units), max: 0 };
    case 'flash':
      return { min: 0, max: 1 };
  }
}

export const DEG = Math.PI / 180;
