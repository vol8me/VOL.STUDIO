import { describe, expect, it } from 'vitest';

import {
  countClips,
  integratedLoudness,
  kWeighting,
  maxMomentaryLoudness,
  samplePeakDb,
  truePeakDb,
} from '../src/analysis/loudness';
import {
  ASSET_CLASS_POLICIES,
  classifyAssetPath,
  evaluateAssetPolicy,
  measureAsset,
  type AssetMeasurement,
} from '../src/analysis/assetQa';

/**
 * Beklenen değerler uygulamadan DEĞİL, yayımlanmış kaynaklardan gelir:
 * ITU-R BS.1770-5 Tablo 1/2 (48 kHz katsayıları) ve EBU Tech 3341 v4
 * minimum gereksinim sinyalleri (tolerans: yükseklik ±0.1 LU, true peak
 * +0.2/−0.4 dB). "−23 dBFS" sinüs tepe genliği 10^(−23/20)'dir (tam ölçekli
 * sinüs = 0 dBFS).
 */

const FS = 48000;

function sine(
  seconds: number,
  dbfs: number,
  frequency = 1000,
  phaseDegrees = 0,
  sampleRate = FS,
): Float32Array {
  const amplitude = Math.pow(10, dbfs / 20);
  const phase = (phaseDegrees * Math.PI) / 180;
  return Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase),
  );
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const stereo = (x: Float32Array): Float32Array[] => [x, x.slice()];

describe('BS.1770-5 K-ağırlıklama', () => {
  it('48 kHz katsayıları Tablo 1 ve Tablo 2 ile aynıdır', () => {
    const [shelf, highpass] = kWeighting(48000);
    const table1 = {
      b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
      a: [-1.69065929318241, 0.73248077421585],
    };
    const table2 = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
    shelf.b.forEach((v, i) => expect(v).toBeCloseTo(table1.b[i], 12));
    shelf.a.forEach((v, i) => expect(v).toBeCloseTo(table1.a[i], 12));
    highpass.b.forEach((v, i) => expect(v).toBeCloseTo(table2.b[i], 12));
    highpass.a.forEach((v, i) => expect(v).toBeCloseTo(table2.a[i], 12));
  });
});

describe('EBU Tech 3341 — integrated loudness', () => {
  it('#1: 1 kHz stereo, −23 dBFS, 20 sn → −23.0 LUFS', () => {
    expect(integratedLoudness(stereo(sine(20, -23)), FS)).toBeCloseTo(-23, 1);
  });

  it('#2: −33 dBFS → −33.0 LUFS', () => {
    expect(integratedLoudness(stereo(sine(20, -33)), FS)).toBeCloseTo(-33, 1);
  });

  it('#3: göreli kapı (−36 / −23 / −36 dBFS; 10 / 60 / 10 sn) → −23.0 LUFS', () => {
    const x = concat(sine(10, -36), sine(60, -23), sine(10, -36));
    expect(Math.abs(integratedLoudness(stereo(x), FS) + 23)).toBeLessThanOrEqual(0.1);
  });

  it('#5: (−26 / −20 / −26 dBFS; 20 / 20.1 / 20 sn) → −23.0 LUFS', () => {
    const x = concat(sine(20, -26), sine(20.1, -20), sine(20, -26));
    expect(Math.abs(integratedLoudness(stereo(x), FS) + 23)).toBeLessThanOrEqual(0.1);
  });

  it('400 ms’den kısa sinyalde integrated tanımsızdır (−∞), sayı uydurulmaz', () => {
    expect(integratedLoudness(stereo(sine(0.3, -10)), FS)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('EBU Tech 3341 — momentary', () => {
  it('#12: (0.18 sn −20 / 0.22 sn −30) × 25 → M = −23.0 LUFS', () => {
    const cycle = concat(sine(0.18, -20), sine(0.22, -30));
    const x = concat(...Array.from({ length: 25 }, () => cycle));
    expect(Math.abs(maxMomentaryLoudness(stereo(x), FS) + 23)).toBeLessThanOrEqual(0.1);
  });

  it('#13 benzeri: 400 ms’lik −23 dBFS darbe → en yüksek M = −23.0 LUFS', () => {
    const x = concat(new Float32Array(FS), sine(0.4, -23), new Float32Array(FS));
    expect(Math.abs(maxMomentaryLoudness(stereo(x), FS) + 23)).toBeLessThanOrEqual(0.1);
  });
});

describe('EBU Tech 3341 — true peak (48 kHz, 0.5 FFS ≈ −6.02 dBTP)', () => {
  const within = (measured: number, expected: number) => {
    expect(measured).toBeLessThanOrEqual(expected + 0.2);
    expect(measured).toBeGreaterThanOrEqual(expected - 0.4);
  };
  // 20 ms kosinüs giriş/çıkış: sinyalin kenarındaki ani basamak bant sınırlı
  // yeniden yapılandırmada Gibbs aşımı üretir (tonun kendisine ait değildir).
  const tone = (fraction: number, phase: number, amplitudeDb: number) => {
    const x = sine(1, amplitudeDb, FS * fraction, phase);
    const ramp = Math.round(0.02 * FS);
    for (let i = 0; i < ramp; i++) {
      const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / ramp);
      x[i] *= g;
      x[x.length - 1 - i] *= g;
    }
    return stereo(x);
  };
  const half = 20 * Math.log10(0.5);

  it('#15: fs/4, 0°', () => within(truePeakDb(tone(1 / 4, 0, half), FS), -6.02));
  it('#16: fs/4, 45° — örnek tepesi 3 dB düşük okur', () => {
    const x = tone(1 / 4, 45, half);
    within(truePeakDb(x, FS), -6.02);
    expect(samplePeakDb(x)).toBeCloseTo(-9.03, 1);
  });
  it('#17: fs/6, 60°', () => within(truePeakDb(tone(1 / 6, 60, half), FS), -6.02));
  it('#18: fs/8, 67.5°', () => within(truePeakDb(tone(1 / 8, 67.5, half), FS), -6.02));
  it('#19: fs/4, 1.41 FFS, 45° → +3.0 dBTP', () =>
    within(truePeakDb(tone(1 / 4, 45, 20 * Math.log10(1.41)), FS), 20 * Math.log10(1.41)));
});

describe('kırpma sayımı kanal örneği cinsindendir', () => {
  it('kanallar ayrı sayılır, çerçeve sayısı ayrıca verilir', () => {
    const left = new Float32Array([0, 1, 0.2, -1, 0]);
    const right = new Float32Array([0, 1, 0.9995, 0, 0]);
    const count = countClips([left, right]);
    expect(count.perChannel).toEqual([2, 2]);
    expect(count.channelSamples).toBe(4);
    // Çerçeve 1'de iki kanal birden kırptı: 3 çerçeve, 4 kanal örneği.
    expect(count.frames).toBe(3);
  });
});

describe('varlık sınıfı politikası', () => {
  const measurement = (overrides: Partial<AssetMeasurement>): AssetMeasurement => ({
    durationSeconds: 1,
    channels: 2,
    integratedLufs: -16,
    maxMomentaryLufs: -12,
    truePeakDbtp: -2,
    samplePeakDbfs: -2.5,
    clips: { perChannel: [0, 0], channelSamples: 0, frames: 0 },
    ...overrides,
  });

  it('yol kuralı oyun adı bilmeden sınıflar', () => {
    expect(classifyAssetPath('music/boss/theme.ogg')).toBe('music');
    expect(classifyAssetPath('ambience/wind.ogg')).toBe('ambience');
    expect(classifyAssetPath('sfx/ui/click.ogg')).toBe('ui');
    expect(classifyAssetPath('sfx/combat/hit.ogg')).toBe('sfx');
    // Dosya adı klasör sayılmaz.
    expect(classifyAssetPath('sfx/music.ogg')).toBe('sfx');
  });

  it('uzun varlık integrated, kısa olay en yüksek momentary ile ölçülür', () => {
    expect(evaluateAssetPolicy(measurement({}), 'music').violations).toEqual([]);
    // Müzik aralığı [−20, −12]: −8 LUFS'lik müzik kaba seviye hatasıdır.
    expect(
      evaluateAssetPolicy(measurement({ integratedLufs: -8 }), 'music').violations,
    ).toHaveLength(1);
    // UI kısa olaydır: integrated tanımsız olsa da momentary ölçülür.
    const ui = measurement({ integratedLufs: null, maxMomentaryLufs: -20 });
    expect(evaluateAssetPolicy(ui, 'ui').violations).toEqual([]);
    expect(evaluateAssetPolicy(ui, 'music').violations[0]).toMatch(/ölçülemedi/);
  });

  it('true peak tavanı ve kanal bazlı kırpma ayrı ihlallerdir', () => {
    const hot = measurement({
      truePeakDbtp: -0.5,
      clips: { perChannel: [3, 0], channelSamples: 3, frames: 3 },
    });
    const violations = evaluateAssetPolicy(hot, 'sfx').violations;
    expect(violations.some((v) => v.includes('true peak'))).toBe(true);
    expect(violations.some((v) => v.includes('kanal başına 3/0'))).toBe(true);
  });

  it('politika makine-okunurdur ve her sınıfın tavanı −1 dBTP’dir', () => {
    expect(JSON.parse(JSON.stringify(ASSET_CLASS_POLICIES))).toEqual(ASSET_CLASS_POLICIES);
    for (const policy of Object.values(ASSET_CLASS_POLICIES.classes)) {
      expect(policy.truePeakMax).toBe(-1);
    }
  });

  it('measureAsset kısa sinyalde integrated için sayı uydurmaz', () => {
    const short = measureAsset(stereo(sine(0.2, -12)), FS);
    expect(short.integratedLufs).toBeNull();
    expect(short.maxMomentaryLufs).not.toBeNull();
  });
});
