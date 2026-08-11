export type Easing = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,
  easeOutCubic: (t: number): number => 1 - (1 - t) ** 3,
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
} as const;

export interface AnimateValueOptions {
  from: number;
  to: number;
  durationMs: number;
  easing?: Easing;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

/** requestAnimationFrame tabanlı sayı interpolasyonu (barlar, sayaçlar). Dönen fonksiyon animasyonu iptal eder. */
export function animateValue(options: AnimateValueOptions): () => void {
  const { from, to, durationMs, easing = Easing.easeOutCubic, onUpdate, onComplete } = options;

  if (durationMs <= 0) {
    onUpdate(to);
    onComplete?.();
    return () => {};
  }

  let rafId: number;
  let cancelled = false;
  // Süre bilinçli olarak çağrı anından ölçülür (ilk kareden değil): bir TimerBar
  // start()'tan tam `durationMs` sonra dolmalı, bir kare gecikmeyle değil.
  const startTime = performance.now();

  const step = (now: number): void => {
    // Bayrak şart: onUpdate içinden iptal edilirse `rafId` o an çalışan (zaten
    // ateşlenmiş) frame'i gösterir, cancelAnimationFrame hiçbir şey yapmaz ve
    // aşağıdaki satır yeni bir frame zamanlayarak animasyonu sürdürürdü.
    if (cancelled) return;

    // rAF damgası KARE BAŞLANGICINI taşır; requestAnimationFrame o karenin
    // işlenmesi sırasında çağrıldıysa damga startTime'dan küçük olabilir.
    // Kelepçesiz bırakılırsa t negatife düşer ve easeOutCubic ilk karede
    // hedefin tersine taşar (1 - (1-t)^3, t<0 için negatif).
    const elapsed = Math.max(0, now - startTime);
    const t = Math.min(1, elapsed / durationMs);
    const value = from + (to - from) * easing(t);
    onUpdate(value);

    if (cancelled) return;

    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  };

  rafId = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}
