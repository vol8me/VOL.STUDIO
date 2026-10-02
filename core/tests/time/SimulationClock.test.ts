import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../../src/time/SimulationClock';

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

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'geçersiz sabit adımı reddeder: %s',
    (fixedStepMs) => {
      expect(() => new SimulationClock({ fixedStepMs, maxStepsPerFrame: 8 })).toThrow(RangeError);
    },
  );

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'geçersiz catch-up sınırını reddeder: %s',
    (maxStepsPerFrame) => {
      expect(() => new SimulationClock({ fixedStepMs: 16, maxStepsPerFrame })).toThrow(RangeError);
    },
  );

  it('yapılandırmayı kopyalar', () => {
    const config = { fixedStepMs: 16, maxStepsPerFrame: 2 };
    const clock = new SimulationClock(config);
    config.fixedStepMs = 5000;
    config.maxStepsPerFrame = 0;
    const steps: number[] = [];
    expect(clock.advance(5000, (ms) => steps.push(ms)).fixedSteps).toBe(2);
    expect(steps).toEqual([16, 16]);
  });

  it('başarısız tick zamanı ve kimliği yeniden yüklemez', () => {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 2,
      partialStep: 'defer',
    });
    expect(() =>
      clock.advance(32, () => {
        throw new Error('tick');
      }),
    ).toThrow('tick');
    expect(clock.getSimulationTimeMs()).toBe(0);
    const ticks: number[] = [];
    clock.advance(0, (_ms, _index, tickId) => ticks.push(tickId));
    expect(clock.getSimulationTimeMs()).toBe(32);
    expect(ticks).toEqual([1, 2]);
  });

  it('callback içindeki reentry ve reset reddedilir', () => {
    const { clock } = makeClock();
    clock.advance(FIXED, () => {
      expect(() => clock.advance(100, () => undefined)).toThrow(/advance/);
      expect(() => clock.reset()).toThrow(/advance/);
    });
    expect(clock.getSimulationTimeMs()).toBe(FIXED);
  });

  it('ham, kabul, atılan ve biriken süreyi aynı muhasebede bildirir', () => {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 2,
      partialStep: 'defer',
    });
    clock.advance(7, () => undefined);
    const frame = clock.advance(5000, () => undefined, { acceptedDeltaMs: 100 });
    expect(frame).toMatchObject({
      rawDeltaMs: 5000,
      acceptedDeltaMs: 100,
      simulatedMs: 32,
      accumulatorBeforeMs: 7,
      accumulatorMs: 11,
      droppedMs: 4964,
      tickStart: 0,
      tickEnd: 2,
    });
    expect(frame.accumulatorBeforeMs + frame.rawDeltaMs).toBe(
      frame.simulatedMs + frame.accumulatorMs + frame.droppedMs,
    );
    expect(clock.advance(12, () => undefined, { paused: true })).toMatchObject({
      acceptedDeltaMs: 0,
      simulatedMs: 0,
      droppedMs: 12,
      accumulatorMs: 11,
      tickEnd: 2,
    });
    expect(clock.advance(0, () => undefined)).toMatchObject({
      simulatedMs: 0,
      tickStart: 2,
      tickEnd: 2,
    });
    expect(clock.advance(5, () => undefined)).toMatchObject({ tickStart: 2, tickEnd: 3 });
  });
});

describe('artık dilim politikası', () => {
  /** Verilen frame temposunu koşar ve simülasyon zaman çizelgesini döner. */
  function timeline(policy: 'simulate' | 'defer', frames: readonly number[]): string[] {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 8,
      partialStep: policy,
    });
    const steps: string[] = [];
    for (const delta of frames) {
      clock.advance(delta, (stepMs) => steps.push(stepMs.toFixed(4)));
    }
    return steps;
  }

  /* Aynı TOPLAM süre, iki farklı tempo: 60 FPS ve 120 FPS. */
  const AT_60 = Array.from({ length: 30 }, () => 16);
  const AT_120 = Array.from({ length: 60 }, () => 8);

  it('`defer`: aynı toplam süre, farklı tempo → AYNI simülasyon çizelgesi', () => {
    /*
     * Strict determinizmin tanımı budur. Adım dizisi frame temposundan
     * bağımsız olmalı; aksi halde bir tekrar oynatma ya da ölçüm, kaydedildiği
     * makinenin kare hızına bağlı kalır.
     */
    expect(timeline('defer', AT_60)).toEqual(timeline('defer', AT_120));
    expect(timeline('defer', AT_60).every((step) => step === '16.0000')).toBe(true);
  });

  it('`defer` artık dilimi HİÇ simüle etmez, biriktiricide bekletir', () => {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 8,
      partialStep: 'defer',
    });
    const frame = clock.advance(10, () => undefined);

    expect(frame.fixedSteps).toBe(0);
    expect(frame.partialStepMs, 'defer kipinde kısmi adım koşulmaz').toBe(0);
    expect(clock.getAccumulatorMs()).toBeCloseTo(10, 9);
    expect(clock.getSimulationTimeMs(), 'simülasyon saati ilerlememeli').toBe(0);
  });

  it('`simulate` (varsayılan) tempoya DUYARLIDIR — belgelenen ödün gerçektir', () => {
    /*
     * Bu test varsayılanı savunmuyor, SINIRINI kanıtlıyor. Ödün belgede
     * yazılı; yazılı bir sınırın gerçekten var olduğunu göstermek, sonradan
     * "aslında deterministikti" diye yanlış hatırlanmasını engeller.
     */
    expect(timeline('simulate', AT_60)).not.toEqual(timeline('simulate', AT_120));
  });

  it('varsayılan politika `simulate` — mevcut oynanış hissi değişmez', () => {
    const clock = new SimulationClock({ fixedStepMs: 16, maxStepsPerFrame: 8 });
    expect(clock.getPartialStepPolicy()).toBe('simulate');

    const frame = clock.advance(10, () => undefined);
    expect(frame.partialStepMs).toBeCloseTo(10, 9);
  });

  it('interpolasyon payı bir sonraki adıma yaklaşımı [0,1) aralığında verir', () => {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 8,
      partialStep: 'defer',
    });

    expect(clock.getInterpolationAlpha()).toBe(0);
    clock.advance(12, () => undefined);
    expect(clock.getInterpolationAlpha()).toBeCloseTo(12 / 16, 9);

    // Tam adım tüketildiğinde pay başa döner; 1'e ULAŞMAZ.
    clock.advance(4, () => undefined);
    expect(clock.getInterpolationAlpha()).toBeLessThan(1);
    expect(clock.getInterpolationAlpha()).toBeCloseTo(0, 6);
  });
});

it('başarılı adımın ardından hata, yalnız başarısız zamanı yeniden bekletir', () => {
  const clock = new SimulationClock({ fixedStepMs: 16, maxStepsPerFrame: 3, partialStep: 'defer' });
  expect(() =>
    clock.advance(48, (_ms, index) => {
      if (index === 1) throw new Error('second');
    }),
  ).toThrow('second');
  expect(clock.getSimulationTimeMs()).toBe(16);
  expect(clock.getAccumulatorMs()).toBe(32);
  const ticks: number[] = [];
  expect(clock.advance(0, (_ms, _index, tick) => ticks.push(tick))).toMatchObject({
    simulatedMs: 32,
    tickStart: 1,
    tickEnd: 3,
  });
  expect(ticks).toEqual([2, 3]);
});

it('kısmi adım hatasında da saat ve biriktirici korunur', () => {
  const clock = new SimulationClock({ fixedStepMs: 16, maxStepsPerFrame: 1 });
  expect(() =>
    clock.advance(7, () => {
      throw new Error('partial');
    }),
  ).toThrow('partial');
  expect(clock.getSimulationTimeMs()).toBe(0);
  expect(clock.advance(0, () => undefined)).toMatchObject({
    partialStepMs: 7,
    simulatedMs: 7,
    tickStart: 0,
    tickEnd: 1,
  });
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -10])(
  'geçersiz ham süre %s muhasebeye sıfır girer',
  (delta) => {
    const clock = new SimulationClock({
      fixedStepMs: 16,
      maxStepsPerFrame: 2,
      partialStep: 'defer',
    });
    clock.advance(5, () => undefined);
    expect(clock.advance(delta, () => undefined)).toMatchObject({
      rawDeltaMs: 0,
      acceptedDeltaMs: 0,
      simulatedMs: 0,
      accumulatorBeforeMs: 5,
      accumulatorMs: 5,
      droppedMs: 0,
      tickStart: 0,
      tickEnd: 0,
    });
  },
);

describe('SimulationClock taşma bariyeri', () => {
  it('birikim taşmasını callback ve mutasyondan önce reddeder', () => {
    const clock = new SimulationClock({
      fixedStepMs: 1.5e308,
      maxStepsPerFrame: 1,
      partialStep: 'defer',
    });
    clock.advance(1e308, () => {});
    let called = false;
    expect(() =>
      clock.advance(1e308, () => {
        called = true;
      }),
    ).toThrow(RangeError);
    expect(called).toBe(false);
    expect(clock.getAccumulatorMs()).toBe(1e308);
    expect(clock.getSimulationTimeMs()).toBe(0);
    expect(clock.advance(5e307, () => {}).tickEnd).toBe(1);
  });

  it('koşu zamanı taşmasını callback ve mutasyondan önce reddeder', () => {
    const clock = new SimulationClock({
      fixedStepMs: 1e308,
      maxStepsPerFrame: 1,
      partialStep: 'defer',
    });
    clock.advance(1e308, () => {});
    let called = false;
    expect(() =>
      clock.advance(1e308, () => {
        called = true;
      }),
    ).toThrow(RangeError);
    expect(called).toBe(false);
    expect(clock.getAccumulatorMs()).toBe(0);
    expect(clock.getSimulationTimeMs()).toBe(1e308);
    expect(clock.advance(0, () => {}).tickEnd).toBe(1);
  });
});
