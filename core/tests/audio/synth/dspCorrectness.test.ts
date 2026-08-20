import { describe, it, expect } from 'vitest';
import { synth, limitBuffer, applyGlobalEffects } from '../../../src/audio/synth/engine';
import { StereoWidener, Distortion, estimateDelayTail } from '../../../src/audio/synth/effects';
import { getWaveSampleWithPhase } from '../../../src/audio/synth/waveforms';
import { Envelope } from '../../../src/audio/synth/envelope';
import { createRandom } from '../../../src/audio/synth/random';
import { writeWav } from '../../../src/audio/synth/writer';

/**
 * DSP doğruluk testleri.
 */

const SR = 44100;

/** Sıfır geçiş sayısından ortalama frekansı kestirir. */
function estimateFreq(buf: Float32Array, from: number, to: number): number {
  let crossings = 0;
  for (let i = from + 1; i < to; i++) {
    if (buf[i - 1] < 0 && buf[i] >= 0) crossings++;
  }
  return (crossings * SR) / (to - from);
}

function flatEnvelope(duration: number) {
  return {
    attack: 0.001,
    sustain: duration,
    release: 0.001,
    sustainLevel: 1,
    curve: 'linear' as const,
  };
}

function peak(buf: Float32Array): number {
  let max = 0;
  for (const s of buf) max = Math.max(max, Math.abs(s));
  return max;
}

describe('S1 — osilatör fazı frekansın integrali', () => {
  it('lineer slide nota sonunda hedef frekansa varır', () => {
    const r = synth(1, {
      wave: 'sine',
      frequency: 200,
      slide: 200,
      slideCurve: 'linear',
      sampleRate: SR,
      envelope: flatEnvelope(1),
    });
    const ch = r.channels[0];
    const measured = estimateFreq(ch, Math.floor(ch.length * 0.9), Math.floor(ch.length * 0.99));

    // Lineer slide sonunda hedef frekans civarında ölçülmeli.
    expect(measured).toBeGreaterThan(360);
    expect(measured).toBeLessThan(430);
  });

  it('vibrato derinliği zamanla büyümez', () => {
    const r = synth(2, {
      wave: 'sine',
      frequency: 440,
      vibratoDepth: 20,
      vibratoRate: 5,
      sampleRate: SR,
      envelope: flatEnvelope(2),
    });
    const ch = r.channels[0];
    const win = Math.floor(SR * 0.05);
    const spread = (offset: number): number => {
      const values: number[] = [];
      for (let k = 0; k < 8; k++) {
        values.push(estimateFreq(ch, offset + k * win, offset + (k + 1) * win));
      }
      return Math.max(...values) - Math.min(...values);
    };

    const early = spread(0);
    const late = spread(ch.length - 9 * win);

    // Vibrato sapması zamanla 1.5 katın üzerine çıkmamalı.
    expect(late).toBeLessThan(early * 1.5 + 5);
  });
});

describe('S3 — dikdörtgen dalga PolyBLEP', () => {
  it('square, pulse(pw=0.5) ile birebir aynı', () => {
    for (const phase of [0, 0.005, 0.25, 0.495, 0.5, 0.505, 0.75, 0.995]) {
      expect(getWaveSampleWithPhase('square', phase, 0.5, 0.01)).toBeCloseTo(
        getWaveSampleWithPhase('pulse', phase, 0.5, 0.01),
        10,
      );
    }
  });

  it('çıktı [-1, 1] aralığını aşmaz', () => {
    for (const wave of ['square', 'pulse', 'sawtooth', 'sine', 'triangle'] as const) {
      for (let i = 0; i < 1000; i++) {
        const value = getWaveSampleWithPhase(wave, i / 1000, 0.3, 0.02);
        // Dalga çıktısı [-1, 1] aralığında kalmalı.
        expect(Math.abs(value), `${wave} @ ${i / 1000}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe('S4 — normalize opsiyonel', () => {
  it('normalize:false doğal seviyeyi korur', () => {
    const params = { wave: 'sine' as const, frequency: 440, gain: 0.5, sampleRate: SR };
    const normalized = synth(0.1, params).channels[0];
    const natural = synth(0.1, { ...params, normalize: false }).channels[0];

    expect(peak(normalized)).toBeCloseTo(0.95 * 0.5, 2);
    // Doğal tepe ~1.0 × gain 0.5 — normalize edilmiş halden farklı olmalı.
    expect(peak(natural)).toBeGreaterThan(peak(normalized));
  });
});

describe('S5 — StereoWidener kazanç korunumu', () => {
  it('mono kaynak her genişlikte aynı seviyede kalır', () => {
    for (const width of [0, 0.5, 1, 1.5, 2]) {
      const [l, r] = new StereoWidener(width).process(0.5, 0.5);
      // Mono kaynakta side sinyali yok; genişlik seviyeyi DEĞİŞTİRMEMELİ.
      expect(l, `width=${width}`).toBeCloseTo(0.5, 6);
      expect(r, `width=${width}`).toBeCloseTo(0.5, 6);
    }
  });

  it('width=1 stereo kaynağı değiştirmez', () => {
    const [l, r] = new StereoWidener(1).process(0.8, -0.2);
    expect(l).toBeCloseTo(0.8, 6);
    expect(r).toBeCloseTo(-0.2, 6);
  });
});

describe('S6 — limiter transfer eğrisi', () => {
  it('monoton artan', () => {
    const inputs: number[] = [];
    for (let v = 0; v <= 1.5; v += 0.01) inputs.push(v);
    const outputs = limitBuffer(new Float32Array(inputs));

    for (let i = 1; i < outputs.length; i++) {
      // Çıkış girdisiyle monoton artmalı.
      expect(outputs[i], `girdi ${inputs[i].toFixed(2)}`).toBeGreaterThanOrEqual(
        outputs[i - 1] - 1e-9,
      );
    }
  });

  it('tavan threshold değerinde, threshold-knee değil', () => {
    const out = limitBuffer(new Float32Array([2.0]), 0.95, 0.1);
    expect(out[0]).toBeCloseTo(0.95, 6);
  });

  it('eşiğin altını değiştirmez ve işareti korur', () => {
    const out = limitBuffer(new Float32Array([0.5, -0.5, -2.0]), 0.95, 0.1);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(-0.5, 6);
    expect(out[2]).toBeCloseTo(-0.95, 6);
  });
});

describe('S7 — foldback distortion aralığı', () => {
  it('çıktı [-1, 1] içinde kalır', () => {
    const dist = new Distortion({ amount: 1, type: 'foldback', mix: 1 });
    for (let i = -500; i <= 500; i++) {
      // Çıktı [-1, 1] aralığında kalmalı.
      expect(Math.abs(dist.process(i / 100))).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('S8 — applyGlobalEffects girdiyi bozmaz', () => {
  it('kaynak buffer değişmeden kalır', () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const snapshot = Array.from(input);

    applyGlobalEffects(input, { gain: 1 }, SR, 0.001, 1);

    expect(Array.from(input)).toEqual(snapshot);
  });
});

describe('S12 — kuyruk süresi gerçek sönümden hesaplanır', () => {
  it('feedback arttıkça kuyruk uzar', () => {
    const short = estimateDelayTail({ time: 0.25, feedback: 0.3 });
    const long = estimateDelayTail({ time: 0.25, feedback: 0.8 });

    expect(long).toBeGreaterThan(short);
    // -60 dB kuralı: 0.8 feedback ile ~31 tekrar.
    expect(long).toBeCloseTo((0.25 * Math.log(0.001)) / Math.log(0.8), 3);
  });

  it('feedback yoksa tek gecikme kadar', () => {
    expect(estimateDelayTail({ time: 0.4, feedback: 0 })).toBeCloseTo(0.4, 6);
  });
});

describe('S14 — üretim deterministik', () => {
  it('aynı parametreler birebir aynı çıktıyı verir', () => {
    const params = { wave: 'noise' as const, sampleRate: SR };
    const a = synth(0.05, params).channels[0];
    const b = synth(0.05, params).channels[0];

    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('farklı seed farklı çıktı verir', () => {
    const a = synth(0.05, { wave: 'noise', sampleRate: SR, seed: 1 }).channels[0];
    const b = synth(0.05, { wave: 'noise', sampleRate: SR, seed: 2 }).channels[0];

    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('PRNG düzgün dağılımlı ve tekrarlanabilir', () => {
    const values = Array.from({ length: 20000 }, () => createRandom(42).next());
    expect(new Set(values).size).toBe(1); // aynı seed → aynı ilk değer

    const stream = createRandom(42);
    const samples = Array.from({ length: 20000 }, () => stream.next());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
  });
});

describe('S30 — zarf uç noktalara tam varır', () => {
  it('exponential attack 1.0, release 0.0 döner', () => {
    const env = new Envelope(
      { attack: 0.1, decay: 0, sustain: 0.1, release: 0.1, sustainLevel: 1, curve: 'exponential' },
      1,
    );

    // Uç değerler tam olarak 1.0 ve 0.0 olmalı.
    expect(env.value(0.0999)).toBeGreaterThan(0.9999);
    expect(env.value(0.2999)).toBeLessThan(0.0001);
    expect(env.value(0)).toBe(0);
  });
});

describe('S13 — WAV yazımı çift gain uygulamaz', () => {
  it('normalize edilmiş tepe dosyada korunur', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = mkdtempSync(join(tmpdir(), 'volwav-'));
    const file = join(dir, 'test.wav');

    try {
      writeWav(file, {
        channels: [new Float32Array([0.95, -0.95, 0])],
        sampleRate: SR,
        duration: 3,
      });
      const bytes = readFileSync(file);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      // 0.95 → ~31128; normalize edilmiş tepe dosyada korunur.
      const first = view.getInt16(44, true);
      expect(first).toBeGreaterThan(31000);
      expect(first).toBeLessThanOrEqual(32767);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
