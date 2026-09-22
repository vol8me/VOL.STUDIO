import { createRandom } from '@volstudio/core/random';
import { describe, expect, it } from 'vitest';
import { countOnsets, estimatePitch, estimatePulseRate } from '../../src/analysis/descriptors';

const SR = 48000;

function tone(hz: number, seconds: number, harmonics = 6, decay = 0): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin((2 * Math.PI * hz * h * i) / SR) / h;
    out[i] = 0.3 * v * Math.exp(-decay * (i / SR));
  }
  return out;
}

function noise(seconds: number, seed = 1): Float32Array {
  const random = createRandom(seed);
  return Float32Array.from({ length: Math.round(seconds * SR) }, () => random.bipolar() * 0.3);
}

/** Her `period` saniyede bir 2 ms'lik yüksek frekanslı patlama. */
function pulses(rate: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  const period = Math.round(SR / rate);
  for (let start = 0; start < out.length; start += period) {
    for (let i = 0; i < 96 && start + i < out.length; i++)
      out[start + i] = Math.sin(i * 0.9) * (1 - i / 96);
  }
  return out;
}

describe('YIN perdesi (yin-v1)', () => {
  it.each([110, 220, 440, 880])('%d Hz harmonik ton: ±%%1, yüksek güven', (hz) => {
    const p = estimatePitch([tone(hz, 0.5)], SR);
    expect(p.hz).not.toBeNull();
    expect(Math.abs((p.hz as number) / hz - 1)).toBeLessThan(0.01);
    expect(p.confidence).toBeGreaterThan(0.9);
  });

  it('eksik temelli harmonik dizide perde temel frekanstır, spektral tepe değil', () => {
    const x = tone(200, 0.5, 6).map((v, i) => v - 0.3 * Math.sin((2 * Math.PI * 200 * i) / SR));
    const p = estimatePitch([Float32Array.from(x)], SR);
    expect(Math.abs((p.hz as number) - 200)).toBeLessThan(3);
  });

  it('gürültü perdesizdir (null, güven 0)', () => {
    expect(estimatePitch([noise(0.5)], SR)).toMatchObject({ hz: null, confidence: 0 });
  });

  it('üçten az aktif pencere perde vermez (kısa geçiş savunulamaz)', () => {
    const x = new Float32Array(SR * 0.4);
    x.set(tone(1000, 0.008), 0);
    const p = estimatePitch([x], SR);
    expect(p.hz).toBeNull();
    expect(p.frames).toBeLessThan(3);
  });

  it('sessizlik: perde yok, pencere yok', () => {
    expect(estimatePitch([new Float32Array(SR)], SR)).toMatchObject({ hz: null, frames: 0 });
  });

  it('pencere aralığı yalnız o bölgeyi ölçer', () => {
    const x = new Float32Array(SR);
    x.set(tone(300, 0.5), 0);
    x.set(tone(600, 0.5), SR / 2);
    expect(Math.round(estimatePitch([x], SR, { from: 0, to: SR / 2 }).hz as number)).toBeCloseTo(
      300,
      -1,
    );
    expect(Math.round(estimatePitch([x], SR, { from: SR / 2, to: SR }).hz as number)).toBeCloseTo(
      600,
      -1,
    );
  });
});

describe('başlangıç ve darbe hızı', () => {
  it('ayrık patlamalar sayılır; sürekli ton yalnız kendi başlangıcını üretir', () => {
    expect(countOnsets([pulses(8, 1)], SR).count).toBe(8);
    for (const hz of [110, 220, 440])
      expect(countOnsets([tone(hz, 1)], SR).count, `${hz} Hz`).toBe(1);
  });

  it.each([5, 22, 60])('%d Hz darbe dizisinin hızı ±%%5 ölçülür (katları seçilmez)', (rate) => {
    const pulse = estimatePulseRate([pulses(rate, 1.5)], SR);
    expect(Math.abs((pulse.hz as number) / rate - 1)).toBeLessThan(0.05);
    expect(pulse.strength).toBeGreaterThan(0.3);
  });

  it('gürültüde periyodiklik yok', () => {
    expect(estimatePulseRate([noise(1.5, 4)], SR).hz).toBeNull();
  });
});
