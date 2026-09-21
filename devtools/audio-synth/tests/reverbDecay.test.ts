import { describe, expect, it } from 'vitest';

import { Reverb } from '../src/index';
import type { ReverbParams } from '../src/types';
import { createRandom } from '@volstudio/core/random';

/**
 * `decay` RT60 saniyesidir ve ÇIKIŞTA ölçülür.
 *
 * Ölçüm Schroeder geri entegrasyonudur (Schroeder 1965; ISO 3382-1 T30):
 * enerji sönüm eğrisi EDC(t) = ∫ₜ^∞ h²; −5…−35 dB aralığına doğru oturtulur
 * ve −60 dB'ye uzatılır. Beklenen taraf yalnız istenen `decay`dir — comb
 * kazancı formülü testte YOK.
 */

const SR = 44100;

function impulseResponse(params: ReverbParams, seconds: number): Float64Array {
  const reverb = new Reverb({ amount: 1, ...params }, SR);
  const out = new Float64Array(Math.ceil(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    const x = i === 0 ? 1 : 0;
    out[i] = reverb.processStereo(x, x)[0];
  }
  return out;
}

function onePoleLowpass(x: Float64Array, cutoffHz: number): Float64Array {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / SR);
  const y = new Float64Array(x.length);
  let state = 0;
  for (let i = 0; i < x.length; i++) {
    state = (1 - a) * x[i] + a * state;
    y[i] = state;
  }
  return y;
}

function energyDecayDb(h: Float64Array): Float64Array {
  const edc = new Float64Array(h.length);
  let acc = 0;
  for (let i = h.length - 1; i >= 0; i--) {
    acc += h[i] * h[i];
    edc[i] = acc;
  }
  const total = edc[0];
  return edc.map((e) => 10 * Math.log10(e / total));
}

/** T30: −5…−35 dB doğrusal regresyonunun −60 dB'ye uzatılması (saniye). */
function measureT30(h: Float64Array): number {
  const edc = energyDecayDb(h);
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  for (let i = 0; i < edc.length; i++) {
    if (edc[i] > -5 || edc[i] < -35) continue;
    const t = i / SR;
    sx += t;
    sy += edc[i];
    sxx += t * t;
    sxy += t * edc[i];
    n++;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return -60 / slope;
}

function measure(params: ReverbParams): number {
  return measureT30(impulseResponse(params, (params.decay ?? 1) * 1.6 + 0.5));
}

describe('Reverb decay = RT60 (saniye)', () => {
  it.each([0.8, 1.4, 2.2, 3.5])('istenen %s sn ölçülen T30 ile tutar', (decay) => {
    const measured = measure({ decay, roomSize: 0.6, damp: 0 });
    expect(measured).toBeGreaterThan(decay * 0.95);
    expect(measured).toBeLessThan(decay * 1.05);
  });

  it('farklı decay farklı sönüm verir — kelepçelenip aynı değere çökmez', () => {
    const measured = [0.8, 1.4, 2.2, 3.5].map((decay) => measure({ decay, damp: 0 }));
    for (let i = 1; i < measured.length; i++) {
      // Komşu istekler arası oran ölçümde de korunmalı (≥ %40 uzama).
      expect(measured[i]).toBeGreaterThan(measured[i - 1] * 1.4);
    }
  });

  it('roomSize sönüm süresini değiştirmez, yalnız oda boyutunu', () => {
    const small = measure({ decay: 2.2, roomSize: 0.1, damp: 0 });
    const large = measure({ decay: 2.2, roomSize: 1, damp: 0 });
    expect(Math.abs(small - large) / 2.2).toBeLessThan(0.03);
  });

  it('damp tizleri hızlı söndürür, RT60 alçak frekansta tutar', () => {
    const h = impulseResponse({ decay: 2.2, roomSize: 0.6, damp: 0.5 }, 4.1);
    const broadband = measureT30(h);
    const low = measureT30(onePoleLowpass(h, 150));
    expect(broadband).toBeLessThan(2.2 * 0.9);
    expect(low).toBeGreaterThan(2.2 * 0.92);
    expect(low).toBeLessThan(2.2 * 1.05);
  });

  it('tailSeconds sonrasında kalan enerji −60 dB altındadır', () => {
    for (const params of [
      { decay: 0.8, roomSize: 0.2, damp: 0 },
      { decay: 3.5, roomSize: 0.9, damp: 0, preDelay: 0.05 },
    ]) {
      const reverb = new Reverb(params, SR);
      const edc = energyDecayDb(impulseResponse(params, params.decay * 1.6 + 0.6));
      expect(edc[Math.floor(reverb.tailSeconds * SR)]).toBeLessThan(-60);
      // Tahmin gereğinden cömert de olmamalı: tamponu boşuna uzatır.
      expect(reverb.tailSeconds).toBeLessThan(params.decay + (params.preDelay ?? 0) + 0.15);
    }
  });

  it('preDelay wet yanıtı o kadar geciktirir', () => {
    const h = impulseResponse({ decay: 1, preDelay: 0.05, damp: 0 }, 0.3);
    const firstNonZero = h.findIndex((v) => Math.abs(v) > 1e-9);
    expect(firstNonZero).toBeGreaterThanOrEqual(Math.round(0.05 * SR));
  });

  it('amount bir karışım oranıdır: wet enerji decay ile değişmez', () => {
    // Uzun RT60'ta comb'larda biriken enerji normalize edilmezse wet ~10 dB
    // yükselir ve `decay` süreyle birlikte seviyeyi de değiştirirdi.
    const gains = [0.8, 3.5].map((decay) => {
      const reverb = new Reverb({ amount: 1, decay, damp: 0.4 }, SR);
      const random = createRandom(3);
      let input = 0;
      let wet = 0;
      for (let i = 0; i < SR * 6; i++) {
        const x = random.bipolar();
        const [l] = reverb.processStereo(x, x);
        if (i < SR * 2) continue;
        input += x * x;
        wet += l * l;
      }
      return 10 * Math.log10(wet / input);
    });
    for (const gain of gains) expect(Math.abs(gain)).toBeLessThan(0.5);
  });

  it('wet yol DC taşımaz', () => {
    const reverb = new Reverb({ amount: 1, decay: 3, damp: 0.3 }, SR);
    let last = 0;
    for (let i = 0; i < SR * 4; i++) last = reverb.processStereo(0.5, 0.5)[0];
    expect(Math.abs(last)).toBeLessThan(1e-3);
  });

  it('tarihî VOL.HELL reverb setleri (salt-okur kanarya) artık ayrışır', () => {
    // frozen `vol-hell/final-2026-09-20` paletindeki dokuz bloğun sekizi 1'in
    // üstündeydi ve eski kelepçe hepsini aynı geri beslemeye çökertiyordu.
    const palette: ReverbParams[] = [
      { amount: 0.14, decay: 0.9, roomSize: 0.55, damp: 0.6 },
      { amount: 0.18, decay: 1.1, roomSize: 0.6, damp: 0.55 },
      { amount: 0.18, decay: 1.6, roomSize: 0.6, damp: 0.68 },
      { amount: 0.22, decay: 1.8, roomSize: 0.65, damp: 0.55 },
      { amount: 0.24, decay: 2.2, roomSize: 0.7, damp: 0.62 },
      { amount: 0.26, decay: 2.8, roomSize: 0.8, damp: 0.65 },
      { amount: 0.3, decay: 3.4, roomSize: 0.85, damp: 0.6, preDelay: 0.04 },
      { amount: 0.34, decay: 3.8, roomSize: 0.9, damp: 0.55, preDelay: 0.05 },
    ];
    // `amount` sönümü değil karışımı belirler; kuru darbe EDC'nin başını
    // şişirmesin diye yalnız wet yanıt ölçülür.
    const low = palette.map((params) =>
      measureT30(
        onePoleLowpass(impulseResponse({ ...params, amount: 1 }, params.decay! * 1.6 + 0.6), 150),
      ),
    );
    for (let i = 0; i < palette.length; i++) {
      expect(low[i] / palette[i].decay!).toBeGreaterThan(0.9);
      expect(low[i] / palette[i].decay!).toBeLessThan(1.05);
      if (i > 0) expect(low[i]).toBeGreaterThan(low[i - 1]);
    }
  });
});
