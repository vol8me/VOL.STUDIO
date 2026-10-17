import { describe, expect, it, vi } from 'vitest';
import { PredictionStepper } from '../../src/client/predictionStepper';

const OPTIONS = { maxSliceMs: 1000 / 30, maxSlices: 2, maxSteps: 8 };

describe('PredictionStepper', () => {
  it('prototip/getter seçeneklerini bir kez okuyup sabitler', () => {
    let reads = 0;
    const options = Object.create({
      get maxSliceMs() {
        reads++;
        return OPTIONS.maxSliceMs;
      },
      maxSlices: 2,
      maxSteps: 8,
    }) as typeof OPTIONS;
    const tick = vi.fn(() => 0);
    const stepper = new PredictionStepper({ tick }, options);
    stepper.advance(0, vi.fn());
    stepper.advance(100, vi.fn());
    expect(tick).toHaveBeenCalledTimes(3);
    expect(reads).toBe(1);
  });
  it('ilk tick tabandır; her ara tick bütçesi sonraki tick başlamadan tüketilir', () => {
    let consumed = 0;
    const tick = vi.fn((at: number) => {
      if (at === 0) return 0;
      if (at < 100) {
        expect(consumed).toBe(0);
        return 4;
      }
      expect(consumed).toBe(4);
      return 2;
    });
    const stepper = new PredictionStepper({ tick }, OPTIONS);
    expect(stepper.advance(0, () => consumed++)).toBe(0);
    expect(stepper.advance(100, () => consumed++)).toBe(6);
    expect(consumed).toBe(6);
    expect(tick.mock.calls.map(([at]) => at)).toEqual([0, 100 - OPTIONS.maxSliceMs, 100]);
  });

  it('geçersiz, geri ve aynı saat SDK saatini veya tabanı değiştirmez', () => {
    const tick = vi.fn(() => 0);
    const stepper = new PredictionStepper({ tick }, OPTIONS);
    const consume = vi.fn();
    for (const at of [NaN, Infinity, -Infinity, -1]) stepper.advance(at, consume);
    stepper.advance(40, consume);
    for (const at of [NaN, Infinity, -Infinity, 39, 40, -1]) stepper.advance(at, consume);
    stepper.advance(50, consume);
    expect(tick.mock.calls).toEqual([[40], [50]]);
    expect(consume).not.toHaveBeenCalled();
  });

  it('çok uzun boşluk iki tick ile sınırlıdır; aynı yuvarlanan büyük damga yinelenmez', () => {
    const tick = vi.fn(() => 0);
    const stepper = new PredictionStepper({ tick }, OPTIONS);
    stepper.advance(0, vi.fn());
    stepper.advance(1e6, vi.fn());
    expect(tick.mock.calls).toEqual([[0], [1e6 - OPTIONS.maxSliceMs], [1e6]]);
    stepper.advance(Number.MAX_VALUE, vi.fn());
    expect(tick.mock.calls.at(-1)).toEqual([Number.MAX_VALUE]);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('dispose idempotenttir ve tüketici içinden çağrılınca kalan girdi/dilimleri durdurur', () => {
    const tick = vi.fn(() => 3);
    const stepper = new PredictionStepper({ tick }, OPTIONS);
    const consume = vi.fn(() => stepper.dispose());
    expect(stepper.advance(100, consume)).toBe(1);
    stepper.dispose();
    expect(stepper.advance(200, consume)).toBe(0);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('yakalanan yeniden giriş dış çağrının saatini ve kalan işini bozmaz', () => {
    const tick = vi.fn(() => 1);
    const stepper = new PredictionStepper({ tick }, OPTIONS);
    const consume = vi.fn(() => {
      expect(() => stepper.advance(200, vi.fn())).toThrow('yeniden giriş');
    });
    expect(stepper.advance(0, consume)).toBe(1);
    expect(stepper.advance(10, consume)).toBe(1);
    expect(tick.mock.calls).toEqual([[0], [10]]);
  });

  it.each(['tick', 'consume'] as const)(
    '%s hatasından sonra kısmi işi yeniden göndermez',
    (failure) => {
      const error = new Error('kesinti');
      const tick = vi.fn(() => {
        if (failure === 'tick') throw error;
        return 2;
      });
      const consume = vi.fn(() => {
        throw error;
      });
      const stepper = new PredictionStepper({ tick }, OPTIONS);
      expect(() => stepper.advance(0, consume)).toThrow(error);
      expect(stepper.advance(100, consume)).toBe(0);
      expect(tick).toHaveBeenCalledTimes(1);
      expect(consume).toHaveBeenCalledTimes(failure === 'tick' ? 0 : 1);
    },
  );

  it.each([NaN, Infinity, -1, 0.5, 9])('bozuk SDK bütçesi %s sınırsız girdi üretmez', (due) => {
    const consume = vi.fn();
    const stepper = new PredictionStepper({ tick: () => due }, OPTIONS);
    expect(() => stepper.advance(0, consume)).toThrow(RangeError);
    expect(stepper.advance(100, consume)).toBe(0);
    expect(consume).not.toHaveBeenCalled();
  });

  it('toplam sınır dilimler arasında korunur; seçenek nesnesinin sonradan değişmesi etkisizdir', () => {
    const options = { ...OPTIONS };
    const tick = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(5).mockReturnValueOnce(4);
    const stepper = new PredictionStepper({ tick }, options);
    options.maxSteps = 100;
    const consume = vi.fn();
    stepper.advance(0, consume);
    expect(() => stepper.advance(100, consume)).toThrow(RangeError);
    expect(consume).toHaveBeenCalledTimes(5);
    expect(stepper.advance(200, consume)).toBe(0);
  });

  it.each([
    { maxSliceMs: 0 },
    { maxSliceMs: Infinity },
    { maxSliceMs: NaN },
    { maxSlices: 0 },
    { maxSlices: 1.5 },
    { maxSlices: Infinity },
    { maxSteps: 0 },
    { maxSteps: 0.5 },
    { maxSteps: NaN },
  ])('geçersiz seçenek reddedilir: %j', (patch) => {
    expect(() => new PredictionStepper({ tick: () => 0 }, { ...OPTIONS, ...patch })).toThrow(
      RangeError,
    );
  });
});
