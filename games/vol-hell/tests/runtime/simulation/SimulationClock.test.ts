import { describe, expect, it } from 'vitest';
import { SimulationClock } from '@/runtime/simulation/SimulationClock';

const FIXED = 1000 / 60;

function makeClock(maxStepsPerFrame = 8) {
  const steps: number[] = [];
  const clock = new SimulationClock({ fixedStepMs: FIXED, maxStepsPerFrame });
  return { clock, steps, step: (ms: number) => steps.push(ms) };
}

describe('SimulationClock', () => {
  it('tam bir frame süresini tek sabit adıma çevirir', () => {
    const { clock, steps, step } = makeClock();

    const frame = clock.advance(FIXED, step);

    expect(frame.fixedSteps).toBe(1);
    expect(frame.partialStepMs).toBe(0);
    expect(steps).toEqual([FIXED]);
    expect(clock.getSimulationTimeMs()).toBeCloseTo(FIXED, 6);
  });

  it('düşük FPS frame süresini birden çok SABİT adımla geri kazanır', () => {
    const { clock, steps, step } = makeClock();

    // 50 ms ≈ 20 FPS. 3 × 16.6667 = 50.000000000000007 > 50 olduğu için
    // yalnız İKİ tam adım sığar; kalan ~16.67 ms bir sonraki frame'e taşınır.
    const frame = clock.advance(50, step);

    expect(frame.fixedSteps).toBe(2);
    expect(frame.partialStepMs).toBe(0);
    expect(new Set(steps)).toEqual(new Set([FIXED]));
    expect(clock.getAccumulatorMs()).toBeCloseTo(50 - 2 * FIXED, 6);
  });

  it('60 FPS üstünde artık dilimi simüle eder — girdi tepkisi bir kare gecikmez', () => {
    const { clock, steps, step } = makeClock();

    // 8 ms ≈ 120 FPS: tam adım oluşmaz, artık dilim koşulur.
    const frame = clock.advance(8, step);

    expect(frame.fixedSteps).toBe(0);
    expect(frame.partialStepMs).toBe(8);
    expect(steps).toEqual([8]);
    expect(clock.getAccumulatorMs()).toBe(0);
  });

  it('sekme dönüşü gibi devasa deltada catch-up sınırını uygular ve ATILANI raporlar', () => {
    const { clock, steps, step } = makeClock(8);

    // 5 saniye: sınırsız catch-up olsa 300 adım koşardı.
    const frame = clock.advance(5000, step);

    expect(frame.fixedSteps).toBe(8);
    expect(steps).toHaveLength(8);
    expect(frame.droppedMs).toBeGreaterThan(0);
    // Atılan süre biriktiriciyi tek adımın altına indirmiş olmalı.
    expect(clock.getAccumulatorMs()).toBeLessThan(FIXED);
  });

  it("normal düşük FPS frame'i catch-up sınırına TAKILMAZ", () => {
    const { clock, step } = makeClock(8);

    const frame = clock.advance(100, step);

    expect(frame.fixedSteps).toBe(5);
    expect(frame.droppedMs).toBe(0);
  });

  it('simülasyon saati adımların toplamıdır, render süresinin değil', () => {
    const { clock, step } = makeClock();

    clock.advance(50, step);
    const afterFirst = clock.getSimulationTimeMs();
    clock.advance(50, step);

    // Render 100 ms ilerledi; simülasyon yalnız KOŞULAN adımlar kadar ilerler.
    // İlk frame 2 adım, ikinci frame taşınan artıkla birlikte 3 adım koşar —
    // toplam 5 adım, yani simülasyon saati render saatinin gerisinde kalır ve
    // aradaki fark biriktiricide bekler.
    expect(afterFirst).toBeCloseTo(2 * FIXED, 6);
    expect(clock.getSimulationTimeMs()).toBeCloseTo(5 * FIXED, 6);
    expect(clock.getSimulationTimeMs() + clock.getAccumulatorMs()).toBeCloseTo(100, 6);
  });

  it('artık süre frameler arasında TAŞINIR — zaman kaybolmaz', () => {
    const { clock, steps, step } = makeClock();

    // 10 + 10 ms: ilki artık dilim olarak koşulur, ikincisi de öyle.
    clock.advance(10, step);
    clock.advance(10, step);
    expect(steps).toEqual([10, 10]);

    // Buna karşılık 12 + 12 tam adımı aşar: ikinci frame sabit adım üretir.
    const fresh = makeClock();
    fresh.clock.advance(12, fresh.step);
    expect(fresh.clock.getAccumulatorMs()).toBe(0);
  });

  it('reset koşu sınırında saati ve biriktiriciyi sıfırlar', () => {
    const { clock, step } = makeClock();
    clock.advance(100, step);
    expect(clock.getSimulationTimeMs()).toBeGreaterThan(0);

    clock.reset();

    expect(clock.getSimulationTimeMs()).toBe(0);
    expect(clock.getAccumulatorMs()).toBe(0);
  });

  it('sonlu olmayan ve negatif delta adım üretmez', () => {
    const { clock, steps, step } = makeClock();

    clock.advance(Number.NaN, step);
    clock.advance(Number.POSITIVE_INFINITY, step);
    clock.advance(-100, step);

    expect(steps).toHaveLength(0);
    expect(clock.getSimulationTimeMs()).toBe(0);
  });

  it('geçersiz sabit adım yapılandırmasında hiç adım koşmaz', () => {
    const steps: number[] = [];
    const clock = new SimulationClock({ fixedStepMs: 0, maxStepsPerFrame: 8 });

    const frame = clock.advance(100, (ms) => steps.push(ms));

    expect(frame).toEqual({ fixedSteps: 0, partialStepMs: 0, droppedMs: 0 });
    expect(steps).toHaveLength(0);
  });
});
