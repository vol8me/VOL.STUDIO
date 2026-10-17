import { describe, expect, it } from 'vitest';
import { measureAsset } from '../../src/analysis/assetQa';
import { analyzeAudio, countClicks, measurementOf } from '../../src/analysis/report';
import { createRandom } from '@volstudio/core/random';

const RATE = 48000;

function sine(freq: number, seconds: number, amplitude = 0.5, rate = RATE): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * rate) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * freq * i) / rate),
  );
}

function noise(seconds: number, seed = 1, amplitude = 0.3): Float32Array {
  const random = createRandom(seed);
  return Float32Array.from(
    { length: Math.round(seconds * RATE) },
    () => amplitude * random.bipolar(),
  );
}

describe('analyzeAudio — kanonik rapor', () => {
  it('yükseklik/tepe/kırpma alanları measureAsset ile BİREBİR aynı (tek çekirdek)', () => {
    const x = sine(440, 1.2);
    const y = noise(1.2, 3);
    const report = analyzeAudio([x, y], RATE, 'source-pcm');
    expect(measurementOf(report)).toEqual(measureAsset([x, y], RATE));
    expect(report.measuredFrom).toBe('source-pcm');
    expect(report.format).toEqual({
      sampleRate: RATE,
      channels: 2,
      frames: x.length,
      durationSeconds: 1.2,
    });
  });

  it('RMS, crest ve DC sinüs için analitik değerine eşit', () => {
    const x = sine(1000, 1, 0.5).map((v) => v + 0.01);
    const report = analyzeAudio([x], RATE, 'source-pcm');
    expect(report.level.rmsDbfs).toBeCloseTo(20 * Math.log10(Math.sqrt(0.125 + 0.0001)), 3);
    expect(report.dc.channelOffset[0]).toBeCloseTo(0.01, 4);
    expect(report.level.crestFactorDb).toBeCloseTo(20 * Math.log10(0.51 / Math.sqrt(0.1251)), 2);
    expect(report.stereo).toBeNull();
  });

  it('stereo ilinti ve genişlik: özdeş → 1/0, ters → −1/∞ yerine null, bağımsız → ~0', () => {
    const x = noise(1, 5);
    expect(analyzeAudio([x, x.slice()], RATE, 'source-pcm').stereo).toEqual({
      correlation: 1,
      width: 0,
    });
    const inverted = analyzeAudio([x, x.map((v) => -v)], RATE, 'source-pcm').stereo;
    expect(inverted?.correlation).toBeCloseTo(-1, 6);
    expect(inverted?.width).toBeNull();
    const independent = analyzeAudio([x, noise(1, 6)], RATE, 'source-pcm').stereo;
    expect(Math.abs(independent?.correlation ?? 1)).toBeLessThan(0.02);
    expect(independent?.width).toBeCloseTo(1, 1);
  });

  it('spektral: sinüsün tepe/ağırlık merkezi frekansında; gürültü sinüsten çok daha düz', () => {
    const tone = analyzeAudio([sine(1500, 1)], RATE, 'source-pcm').spectral;
    expect(Math.abs((tone.peakHz ?? 0) - 1500)).toBeLessThan(30);
    expect(Math.abs((tone.centroidHz ?? 0) - 1500)).toBeLessThan(60);
    expect(tone.bandsDb.mid).toBeCloseTo(20 * Math.log10(0.5) - 3, 0);
    const flat = analyzeAudio([noise(1)], RATE, 'source-pcm').spectral;
    expect(flat.flatness ?? 0).toBeGreaterThan(100 * (tone.flatness ?? 1));
    expect(flat.rolloff85Hz ?? 0).toBeGreaterThan(15000);
  });

  it('zamansal: bilinen zarfın tepe/atak/−40 dB sönümü', () => {
    const x = sine(800, 1, 0.8);
    const attack = Math.round(0.05 * RATE);
    for (let i = 0; i < x.length; i++) {
      const t = i / RATE;
      x[i] *= i < attack ? i / attack : Math.pow(10, (-40 * (t - 0.05)) / 0.3 / 20);
    }
    const temporal = analyzeAudio([x], RATE, 'source-pcm').temporal;
    expect(temporal.peakTimeSeconds).toBeCloseTo(0.04, 1);
    expect(temporal.attackSeconds ?? 0).toBeGreaterThan(0.02);
    expect(temporal.decay40Seconds ?? 0).toBeGreaterThan(0.25);
    expect(temporal.decay40Seconds ?? 1).toBeLessThan(0.36);
    expect(temporal.leadingSilenceSeconds).toBe(0);
  });

  it('sessizlik tanımsızdır (null), çökmez', () => {
    const report = analyzeAudio([new Float32Array(4800)], RATE, 'source-pcm');
    expect(report.level.samplePeakDbfs).toBeNull();
    expect(report.level.rmsDbfs).toBeNull();
    expect(report.level.crestFactorDb).toBeNull();
    expect(report.spectral.centroidHz).toBeNull();
    expect(report.temporal.peakTimeSeconds).toBeNull();
    expect(report.temporal.leadingSilenceSeconds).toBeCloseTo(0.1, 6);
  });

  it('kısa sinyal (64 örnek) spektrumu küçük FFT ile ölçer', () => {
    const report = analyzeAudio([sine(3000, 64 / RATE)], RATE, 'source-pcm');
    expect(report.spectral.peakHz).not.toBeNull();
  });
});

describe('tık adayı sayacı', () => {
  it('sessizlikten ani basamak bir tıktır', () => {
    const x = new Float32Array(RATE);
    x.fill(0.5, RATE / 2);
    expect(countClicks([x], RATE).count).toBe(1);
  });

  it('sinüs, beyaz gürültü ve 200 Hz kare dalga tık DEĞİLDİR', () => {
    const square = Float32Array.from({ length: RATE }, (_, i) =>
      Math.floor((i * 200 * 2) / RATE) % 2 === 0 ? 0.4 : -0.4,
    );
    expect(countClicks([sine(5000, 1)], RATE).count).toBe(0);
    expect(countClicks([noise(1)], RATE).count).toBe(0);
    expect(countClicks([square], RATE).count).toBe(0);
  });

  it('sinüs içine gömülü tek sivri örnek bulunur; komşu örnekler tek tıktır', () => {
    const x = sine(300, 1, 0.2);
    x[20000] += 0.6;
    x[20001] += 0.3;
    expect(countClicks([x], RATE).count).toBe(1);
  });
});
