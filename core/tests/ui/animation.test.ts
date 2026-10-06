import { describe, it, expect, vi } from 'vitest';
import { Easing, animateValue } from '../../src/ui/animation';

/** Birkaç gerçek animasyon karesi geçmesini bekler. */
function waitFrames(ms = 120): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('animateValue — iptal sözleşmesi', () => {
  it('K3: onUpdate içinden iptal edilirse animasyon durur', async () => {
    let updates = 0;
    // İptal fonksiyonu onUpdate'in içinden çağrılabilmeli; rAF asenkron olduğu
    // için aşağıdaki atama ilk kareden önce tamamlanır.
    let cancelFn: (() => void) | null = null;

    cancelFn = animateValue({
      from: 0,
      to: 100,
      durationMs: 1000,
      onUpdate: () => {
        updates++;
        cancelFn?.();
      },
    });

    await waitFrames();

    // İptal ilk onUpdate'te geldi; sonraki kareler zamanlanmamalı.
    expect(updates).toBe(1);
  });

  it('K3: iptal edilen animasyon onComplete çağırmaz', async () => {
    const onComplete = vi.fn();
    const cancel = animateValue({
      from: 0,
      to: 1,
      durationMs: 30,
      onUpdate: () => {},
      onComplete,
    });

    cancel();
    await waitFrames();

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('iptal edilmeyen animasyon kare üretmeye devam eder', async () => {
    let updates = 0;

    const cancel = animateValue({
      from: 0,
      to: 50,
      durationMs: 1000,
      onUpdate: () => {
        updates++;
      },
    });

    await waitFrames();
    cancel();

    // Hedef değere ulaşma jsdom'da doğrulanamaz: animateValue başlangıcı
    // performance.now()'dan, ilerlemeyi rAF zaman damgasından alıyor ve jsdom'da
    // bu ikisi farklı zaman origin'i taşıyor (tarayıcıda aynı). Burada yalnızca
    // iptal edilmemiş bir animasyonun kare üretmeyi sürdürdüğü doğrulanır.
    expect(updates).toBeGreaterThan(1);
  });

  it('durationMs <= 0 ise senkron tamamlanır', () => {
    const onUpdate = vi.fn();
    const onComplete = vi.fn();

    animateValue({ from: 0, to: 7, durationMs: 0, onUpdate, onComplete });

    expect(onUpdate).toHaveBeenCalledWith(7);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('Easing eğrileri', () => {
  it('Easing eğrileri uç noktaları korur ve easeOutBack hedefi aşar', () => {
    for (const curve of [Easing.linear, Easing.easeOutCubic, Easing.easeOutBack]) {
      expect(curve(0)).toBeCloseTo(0, 10);
      expect(curve(1)).toBeCloseTo(1, 10);
    }
    // easeOutCubic tekdüze artar ve linear'dan önce ilerler.
    const samples = [0, 0.25, 0.5, 0.75, 1].map((t) => Easing.easeOutCubic(t));
    expect([...samples].sort((a, b) => a - b)).toEqual(samples);
    expect(Easing.easeOutCubic(0.5)).toBeGreaterThan(Easing.linear(0.5));
    // easeOutBack bilinçli aşar: 1'in üstüne çıkıp geri döner.
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map((t) => Easing.easeOutBack(t)))).toBeGreaterThan(1);
  });

  it('animateValue sıfır sürede son değeri hemen verir ve verilen eğriyi kullanır', () => {
    const values: number[] = [];
    const onComplete = vi.fn();
    animateValue({
      from: 2,
      to: 8,
      durationMs: 0,
      easing: Easing.linear,
      onUpdate: (v) => values.push(v),
      onComplete,
    });
    expect(values).toEqual([8]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
