import { describe, expect, it } from 'vitest';
import { decomposeTransient } from '../../src/analysis/decompose';
import { analyzeAudio } from '../../src/analysis/report';
import { onsetSharpnessAt, stretchQuality } from '../../src/analysis/stretchQa';
import { convolve } from '../../src/effects/convolution';
import { AudioParamError } from '../../src/guard/errors';
import { estimateProgramCost, renderProgram } from '../../src/program/render';
import { selectZone } from '../../src/program/sampleBank';
import { resolveProgram } from '../../src/program/schema';
import { shiftAndStretch } from '../../src/synthesis/stretch';
import { hashPcm } from '../../src/protocol/canonical';
import { probeResolver, probeSample, probeStereoSample, registerSample } from '../support/samples';

/**
 * Dalga 9 kapanış kanıtları: bağımsız perde/süre, sampler bölgeleri, granular
 * bulut, konvolüsyon yönlendirmesi ve transient/gövde ayrıştırması. Kayıtlar
 * bellek-içi test kütüphanesindendir (sentetik; gerçek kayıt iddiası yok).
 */
const RATE = 48000;
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});

function tone(f: number, seconds: number, rate = RATE): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => {
    const t = i / rate;
    return (
      0.3 *
      (Math.sin(2 * Math.PI * f * t) +
        0.5 * Math.sin(4 * Math.PI * f * t) +
        0.25 * Math.sin(6 * Math.PI * f * t))
    );
  });
}

function withClick(x: Float32Array, at: number): Float32Array {
  const y = x.slice();
  let state = 12345;
  for (let i = 0; i < 480; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    y[at + i] += 0.9 * (state / 2 ** 31 - 1) * Math.exp(-i / 60);
  }
  return y;
}

const program = (
  samples: Record<string, unknown>,
  layers: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  schema: 'AcousticProgramV1',
  sampleRate: RATE,
  channels: 1,
  durationSeconds: 1,
  seed: 3,
  samples,
  layers,
  master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0.005 },
  ...extra,
});

/*
 * WSOLA/faz vokoderi 1 saniyelik sesi gerçekten işler; kapsam ölçümü
 * (v8) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan dolar
 * (ölçülen: en ağır test 12.5 sn). Süre sınırı bu yüzden blok başına
 * verilir — ölçülen bir kısıt, keyfi bir sayı değil.
 */
describe('bağımsız perde kaydırma ve zaman germe', { timeout: 60_000 }, () => {
  const source = tone(220, 1);

  it.each(['phase-vocoder', 'wsola'] as const)(
    '%s: ±12 yarım tonda süre korunur, perde ×2 / ×½ (±%1)',
    (method) => {
      for (const [semitones, ratio] of [
        [12, 2],
        [-12, 0.5],
      ] as const) {
        const out = shiftAndStretch(source, semitones, 1, method, RATE);
        const q = stretchQuality(source, out, RATE);
        expect(out.length).toBe(source.length);
        expect(Math.abs((q.pitchRatio as number) / ratio - 1)).toBeLessThan(0.01);
      }
    },
  );

  it.each(['phase-vocoder', 'wsola'] as const)(
    '%s: 0.5× / 2× germede perde korunur (±%1), süre tam',
    (method) => {
      for (const stretch of [0.5, 2]) {
        const out = shiftAndStretch(source, 0, stretch, method, RATE);
        const q = stretchQuality(source, out, RATE);
        expect(out.length).toBe(Math.round(source.length * stretch));
        expect(Math.abs((q.pitchRatio as number) - 1)).toBeLessThan(0.01);
      }
    },
  );

  it('artefakt ölçümü: tonalde faz vokoderi uyumlu; 2× germede WSOLA atağı daha iyi korur', () => {
    const tonal = [
      shiftAndStretch(source, 0, 2, 'phase-vocoder', RATE),
      shiftAndStretch(source, 0, 2, 'wsola', RATE),
    ].map((x) => stretchQuality(source, x, RATE).harmonicity as number);
    expect(tonal[0]).toBeGreaterThan(0.95);
    expect(tonal[1]).toBeGreaterThan(0.9);
    const hits = new Float32Array(2 * RATE);
    for (const at of [0.2, 0.7, 1.2])
      hits.set(withClick(tone(180, 0.25), 0).subarray(0, 12000), Math.round(at * RATE));
    const loss = (method: 'wsola' | 'phase-vocoder') => {
      const y = shiftAndStretch(hits, 0, 2, method, RATE);
      return (
        [0.2, 0.7, 1.2].reduce(
          (sum, at) => sum + onsetSharpnessAt(hits, RATE, at) - onsetSharpnessAt(y, RATE, 2 * at),
          0,
        ) / 3
      );
    };
    expect(loss('wsola')).toBeLessThan(loss('phase-vocoder'));
  });

  it('resample yöntemi perde ve süreyi BAĞLI değiştirir; aralık dışı reddedilir', () => {
    const out = shiftAndStretch(source, 12, 1, 'resample', RATE);
    expect(out.length).toBe(Math.ceil(source.length / 2));
    expect(() => shiftAndStretch(source, 30, 1, 'wsola', RATE)).toThrow(AudioParamError);
    expect(() => shiftAndStretch(source, 0, 8, 'wsola', RATE)).toThrow(AudioParamError);
  });
});

describe('source.sample', () => {
  const a = probeSample(0);

  it('bildirimsiz başvuru, kullanılmayan bildirim, çözücüsüz render ve uyumsuz veri adıyla düşer', () => {
    const layer = { name: 's', source: node('source.sample', { sample: 'a' }) };
    expect(() => resolveProgram(program({}, [layer]))).toThrow(/samples/);
    expect(() => resolveProgram(program({ a: a.decl, b: probeSample(1).decl }, [layer]))).toThrow(
      /başvurmuyor/,
    );
    expect(() => renderProgram(program({ a: a.decl }, [layer]))).toThrow(/çözücü/);
    const wrong = { ...a.decl, frames: a.decl.frames + 1 };
    expect(() => renderProgram(program({ a: wrong }, [layer]), { samples: probeResolver })).toThrow(
      /uyuşmuyor/,
    );
  });

  it('başlangıç ofseti ve bileşen (tam/transient/gövde) deterministik ve ayrışık', () => {
    const variants = ['full', 'transient', 'body'].map((component) =>
      renderProgram(
        program({ a: a.decl }, [
          { name: 's', source: node('source.sample', { sample: 'a', component }) },
        ]),
        {
          samples: probeResolver,
        },
      ),
    );
    const hashes = variants.map((r) => hashPcm(r.channels, r.sampleRate));
    expect(new Set(hashes).size).toBe(3);
    const again = renderProgram(
      program({ a: a.decl }, [
        { name: 's', source: node('source.sample', { sample: 'a', component: 'body' }) },
      ]),
      {
        samples: probeResolver,
      },
    );
    expect(hashPcm(again.channels, again.sampleRate)).toBe(hashes[2]);
  });

  it('stereo kayıt stereo programda stereo katman olur (pan almaz); mono kayıt pan alır', () => {
    const stereo = probeStereoSample();
    const stereoProgram = program(
      { st: stereo.decl },
      [{ name: 's', source: node('source.sample', { sample: 'st' }) }],
      { channels: 2 },
    );
    const r = renderProgram(stereoProgram, { samples: probeResolver });
    expect(r.channels[0]).not.toEqual(r.channels[1]);
    expect(resolveProgram(stereoProgram).layers[0].channels).toBe(2);
    expect(() =>
      resolveProgram(
        program(
          { st: stereo.decl },
          [{ name: 's', pan: 0.3, source: node('source.sample', { sample: 'st' }) }],
          { channels: 2 },
        ),
      ),
    ).toThrow(/pan almaz/);
    const mono = resolveProgram(
      program(
        { a: a.decl },
        [{ name: 's', pan: 0.3, source: node('source.sample', { sample: 'a' }) }],
        { channels: 2 },
      ),
    );
    expect(mono.layers[0].channels).toBe(1);
  });
});

describe('source.sampler (SampleBankV1)', () => {
  const soft = probeSample(0);
  const hard = probeSample(1);
  const hardRr = probeSample(2);
  const high = probeSample(3);
  const bank = {
    schema: 'SampleBankV1',
    zones: [
      { sample: 'soft', rootKey: 60, keyLow: 55, keyHigh: 64, velocityHigh: 0.6 },
      { sample: 'hard', rootKey: 60, keyLow: 55, keyHigh: 64, velocityLow: 0.6 },
      { sample: 'hardRr', rootKey: 60, keyLow: 55, keyHigh: 64, velocityLow: 0.6 },
      {
        sample: 'high',
        rootKey: 67,
        keyLow: 65,
        keyHigh: 72,
        loop: { startSeconds: 0.2, endSeconds: 0.5, crossfadeSeconds: 0.02 },
      },
    ],
  };
  const decls = { soft: soft.decl, hard: hard.decl, hardRr: hardRr.decl, high: high.decl };
  const play = (note: number, velocity: number, event = 0, seconds = 1) =>
    renderProgram(
      program(
        decls,
        [{ name: 'n', source: node('source.sampler', { bank: 'keys', note, velocity, event }) }],
        {
          banks: { keys: bank },
          durationSeconds: seconds,
        },
      ),
      { samples: probeResolver },
    ).channels[0];

  it('velocity katmanı, round-robin ve anahtar bölgesi seçimi gerekçeli ve deterministik', () => {
    const zones = resolveProgram(
      program(decls, [{ name: 'n', source: node('source.sampler', { bank: 'keys' }) }], {
        banks: { keys: bank },
      }),
    ).banks.get('keys')!;
    expect(selectZone(zones, 60, 0.4, 0)?.zone.sample).toBe('soft');
    expect(selectZone(zones, 60, 0.9, 0)?.zone.sample).toBe('hard');
    expect(selectZone(zones, 60, 0.9, 1)?.zone.sample).toBe('hardRr');
    expect(selectZone(zones, 60, 0.9, 1)?.reason).toContain('round-robin 1 mod 2');
    expect(selectZone(zones, 69, 0.5, 0)?.zone.sample).toBe('high');
    expect(selectZone(zones, 90, 0.5, 0)).toBeNull();
    expect(hashPcm([play(60, 0.9, 0)], RATE)).not.toBe(hashPcm([play(60, 0.9, 1)], RATE));
    expect(hashPcm([play(60, 0.9, 1)], RATE)).toBe(hashPcm([play(60, 0.9, 1)], RATE));
  });

  it('bölge perdesi kök notadan kayar; bölgesi olmayan nota render’dan önce reddedilir', () => {
    const at = (note: number) => {
      const x = play(note, 0.5, 0);
      return analyzeAudio([x], RATE, 'source-pcm').spectral.peakHz as number;
    };
    expect(at(69) / at(67)).toBeCloseTo(Math.pow(2, 2 / 12), 1);
    expect(() =>
      resolveProgram(
        program(
          decls,
          [{ name: 'n', source: node('source.sampler', { bank: 'keys', note: 100 }) }],
          { banks: { keys: bank } },
        ),
      ),
    ).toThrow(/bölge yok/);
  });

  it('loop bölgesi kaydı aşan notayı tıksız sürdürür', () => {
    const held = play(67, 0.5, 0, 2.5);
    const report = analyzeAudio([held], RATE, 'source-pcm');
    expect(report.defects.clicks.count).toBe(0);
    let late = 0;
    for (let i = Math.round(2 * RATE); i < Math.round(2.4 * RATE); i++) late += held[i] ** 2;
    expect(late).toBeGreaterThan(1e-4);
  });
});

describe('source.granular', () => {
  const texture = registerSample('granular-src', { channels: [tone(330, 1.5)], sampleRate: RATE });
  const cloud = (params: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    program(
      { s: texture },
      [{ name: 'g', source: node('source.granular', { sample: 's', ...params }) }],
      { durationSeconds: 2, ...extra },
    );

  it('donmuş, hareketli ve yoğun bulut: tekrarlanabilir, ayrışık, tıksız', () => {
    const cases = [
      cloud({
        position: 0.5,
        spread: 0,
        pitchSpread: 0,
        density: 60,
        regularity: 1,
        stereoSpread: 0,
      }),
      {
        ...cloud({ position: { gesture: 'p' }, spread: 0.05, pitchSpread: 0.5, stereoSpread: 0 }),
        gestures: {
          p: {
            curve: 'curve.linear',
            version: 1,
            points: [
              [0, 0.05],
              [2, 0.95],
            ],
          },
        },
      },
      cloud({ density: 800, pitchSpread: 7, spread: 0.8, grainSeconds: 0.04, stereoSpread: 0 }),
    ];
    const hashes = cases.map((p) => {
      const a = renderProgram(p, { samples: probeResolver });
      const b = renderProgram(p, { samples: probeResolver });
      expect(hashPcm(a.channels, RATE)).toBe(hashPcm(b.channels, RATE));
      expect(analyzeAudio(a.channels, RATE, 'source-pcm').defects.clicks.count).toBe(0);
      return hashPcm(a.channels, RATE);
    });
    expect(new Set(hashes).size).toBe(3);
  });

  it('stereo yerleşim iki kanalı ayırır; aşırı yoğunluk tanecik tavanında durur (kaçak ayırma yok)', () => {
    const stereo = renderProgram(cloud({ stereoSpread: 1, density: 200 }, { channels: 2 }), {
      samples: probeResolver,
    });
    expect(stereo.channels[0]).not.toEqual(stereo.channels[1]);
    const cost = estimateProgramCost(resolveProgram(cloud({ density: 2000, grainSeconds: 0.5 })));
    expect(cost.workUnits).toBeLessThan(6e9);
    const dense = renderProgram(cloud({ density: 2000, grainSeconds: 0.005 }), {
      samples: probeResolver,
    });
    expect(dense.channels[0].every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('effect.convolution', () => {
  const impulse = registerSample('ir-unit', {
    channels: [Float32Array.from({ length: 64 }, (_, i) => (i === 0 ? 1 : 0))],
    sampleRate: RATE,
  });
  const delayed = registerSample('ir-delay', {
    channels: [Float32Array.from({ length: 48000 }, (_, i) => (i === 4800 ? 0.5 : 0))],
    sampleRate: RATE,
  });
  const stereoIr = registerSample('ir-stereo', {
    channels: [
      Float32Array.from({ length: 2400 }, (_, i) => (i === 0 ? 1 : 0)),
      Float32Array.from({ length: 2400 }, (_, i) => (i === 2399 ? 1 : 0)),
    ],
    sampleRate: RATE,
  });
  const tonal = registerSample('dry', { channels: [tone(440, 0.8)], sampleRate: RATE });
  const withIr = (ir: string, decl: unknown, channels: 1 | 2, pan?: number) =>
    program(
      { ir: decl, dry: tonal },
      [
        {
          name: 'd',
          ...(pan === undefined ? {} : { pan }),
          source: node('source.sample', { sample: 'dry' }),
        },
      ],
      {
        channels,
        effects: [node('effect.convolution', { ir: 'ir', mix: 1, gainDb: 0 })],
      },
    );

  it('birim IR girişi korur; gecikmeli IR kaydırır ve ölçekler; UPOLS doğrudan konvolüsyona eşit', () => {
    const plain = renderProgram(
      program({ dry: tonal }, [{ name: 'd', source: node('source.sample', { sample: 'dry' }) }]),
      { samples: probeResolver },
    );
    const unit = renderProgram(withIr('ir', impulse, 1), { samples: probeResolver });
    let worst = 0;
    for (let i = 0; i < unit.channels[0].length; i++)
      worst = Math.max(worst, Math.abs(unit.channels[0][i] - plain.channels[0][i]));
    expect(worst).toBeLessThan(1e-5);
    const shifted = renderProgram(withIr('ir', delayed, 1), { samples: probeResolver }).channels[0];
    expect(shifted[4800 + 1000]).toBeCloseTo(0.5 * plain.channels[0][1000], 5);
    const x = tone(300, 0.2);
    const h = Float32Array.from(
      { length: 6000 },
      (_, i) => Math.exp(-i / 800) * Math.sin(i * 0.37),
    );
    const fast = convolve(x, h);
    let direct = 0;
    for (const n of [0, 777, 4095, 9000]) {
      let acc = 0;
      for (let k = 0; k <= n && k < h.length; k++) acc += h[k] * (x[n - k] ?? 0);
      direct = Math.max(direct, Math.abs(acc - fast[n]));
    }
    expect(direct).toBeLessThan(1e-4);
  });

  it('stereo IR yönlendirmesi: stereo programda kanal kanal, mono programda ortalama', () => {
    const stereo = renderProgram(withIr('ir', stereoIr, 2), { samples: probeResolver });
    expect(Math.abs(stereo.channels[1][2399 + 500] - stereo.channels[0][500])).toBeLessThan(1e-4);
    const mono = renderProgram(withIr('ir', stereoIr, 1), { samples: probeResolver }).channels[0];
    const plain = renderProgram(
      program({ dry: tonal }, [{ name: 'd', source: node('source.sample', { sample: 'dry' }) }]),
      { samples: probeResolver },
    ).channels[0];
    expect(mono[100]).toBeCloseTo(0.5 * plain[100], 5);
  });

  it('IR uzunluğu maliyete girer; zamana yayılan efekt insert olamaz', () => {
    const cost = (decl: unknown) =>
      estimateProgramCost(resolveProgram(withIr('ir', decl, 1))).workUnits;
    expect(cost(delayed)).toBeGreaterThan(cost(impulse));
    expect(() =>
      resolveProgram(
        program({ ir: impulse, dry: tonal }, [
          {
            name: 'd',
            source: node('source.sample', { sample: 'dry' }),
            inserts: [node('effect.convolution', { ir: 'ir' })],
          },
        ]),
      ),
    ).toThrow(/zamana yayılır/);
  });
});

describe('transient/gövde ayrıştırması (HPSS)', () => {
  const fixture = withClick(tone(220, 1), Math.round(0.25 * RATE));

  it('kontrollü fixture: transient zamanı ±2 ms ve tepesi korunur; toplam yeniden kurulur', () => {
    const parts = decomposeTransient(fixture, RATE);
    expect(parts.status).toBe('ok');
    expect(Math.abs(parts.metrics.transientPeakFrame - 0.25 * RATE)).toBeLessThan(0.002 * RATE);
    expect(parts.metrics.reconstructionErrorDb).toBeLessThan(-60);
    expect(parts.metrics.transientPeakRatio).toBeGreaterThan(0.5);
  });

  it('gövde prosedürel olarak değiştirilebilir; transient zamanlaması aynı kalır', () => {
    const parts = decomposeTransient(fixture, RATE);
    const replaced = Float32Array.from(
      parts.transient,
      (v, i) => v + 0.3 * Math.sin((2 * Math.PI * 330 * i) / RATE),
    );
    const peak = (x: Float32Array) =>
      x.reduce((best, v, i) => (Math.abs(v) > Math.abs(x[best]) ? i : best), 0);
    expect(Math.abs(peak(replaced) - peak(fixture))).toBeLessThan(0.002 * RATE);
    const before = analyzeAudio([fixture], RATE, 'source-pcm').spectral.peakHz as number;
    const after = analyzeAudio([replaced], RATE, 'source-pcm').spectral.peakHz as number;
    expect(Math.abs(before - 220)).toBeLessThan(10);
    expect(Math.abs(after - 330)).toBeLessThan(10);
  });

  it('başarısız ayrıştırma sessiz kalmaz: durağan gürültü ve gövdesiz tık adlı hata verir', () => {
    let state = 7;
    const noise = Float32Array.from({ length: RATE }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return 0.3 * (state / 2 ** 31 - 1);
    });
    const failed = decomposeTransient(noise, RATE);
    expect(failed.status).toBe('failed');
    expect(failed.reason).toMatch(/başlangıç|transient/);
    const click = withClick(new Float32Array(RATE), 1000);
    expect(decomposeTransient(click, RATE).reason).toMatch(/gövde/);
  });
});
