import { describe, expect, it } from 'vitest';
import { RenderBudgetError } from '../../src/guard/budget';
import { AudioParamError, type AudioParamIssue } from '../../src/guard/errors';
import { LINEAR_CURVE, renderGesture } from '../../src/program/curves';
import { estimateProgramCost, renderProgram } from '../../src/program/render';
import { resolveProgram, type AcousticProgramV1 } from '../../src/program/schema';
import { edited, type Edit } from '../support/json';
import { baseProgram, BODY_LAYER } from './fixtures';

function rejects(program: unknown, path: string, issue: AudioParamIssue): void {
  try {
    resolveProgram(program);
  } catch (error) {
    expect(error).toBeInstanceOf(AudioParamError);
    const { path: actualPath, issue: actualIssue } = error as AudioParamError;
    expect({ path: actualPath, issue: actualIssue }).toEqual({ path, issue });
    return;
  }
  throw new Error(`${path} reddedilmedi`);
}

const same = (a: Float32Array[], b: Float32Array[]) =>
  a.length === b.length &&
  a.every((ch, c) => ch.length === b[c].length && ch.every((v, i) => v === b[c][i]));

const RES = ['layers', 0, 'resonators', 0, 'params'] as const;
const gesture = (points: [number, number][], curve = 'curve.linear'): Edit => [
  ['gestures'],
  { g: { curve, version: 1, points } },
];

describe('AcousticProgramV1 doğrulaması (render öncesi)', () => {
  const base = baseProgram();

  it.each<[string, readonly Edit[], string, AudioParamIssue]>([
    ['bilinmeyen üst alan', [[['tempo'], 120]], 'tempo', 'unknown-key'],
    ['şema sürümü', [[['schema'], 'AcousticProgramV2']], 'schema', 'version'],
    ['şema adı', [[['schema'], 'SynthParams']], 'schema', 'type'],
    [
      'bilinmeyen ilkel',
      [[['layers', 0, 'source', 'primitive'], 'source.teleporter']],
      'layers[0].source.primitive',
      'unknown-id',
    ],
    [
      'ilkel sürümü',
      [[['layers', 0, 'source', 'version'], 2]],
      'layers[0].source.primitive@version',
      'version',
    ],
    [
      'yanlış tür',
      [[['layers', 0, 'source', 'primitive'], 'resonator.biquad']],
      'layers[0].source.primitive',
      'type',
    ],
    [
      'bilinmeyen parametre',
      [[[...RES, 'cutoff'], 1]],
      'layers[0].resonators[0].params.cutoff',
      'unknown-key',
    ],
    ['aralık dışı', [[[...RES, 'q'], 400]], 'layers[0].resonators[0].params.q', 'range'],
    [
      'Nyquist',
      [[[...RES, 'frequency'], 9000]],
      'layers[0].resonators[0].params.frequency',
      'range',
    ],
    [
      'bilinmeyen seçenek',
      [[['layers', 0, 'source', 'params', 'color'], 'blue']],
      'layers[0].source.params.color',
      'type',
    ],
    ['NaN', [[['durationSeconds'], Number.NaN]], 'durationSeconds', 'non-finite'],
    ['tohum', [[['seed'], -1]], 'seed', 'range'],
    ['kanal', [[['channels'], 3]], 'channels', 'type'],
    ['mono pan', [[['layers', 0, 'pan'], 0.5]], 'layers[0].pan', 'combination'],
    ['katman adı', [[['layers', 0, 'name'], '1body']], 'layers[0].name', 'type'],
    ['yinelenen katman', [[['layers', 1], BODY_LAYER]], 'layers[1].name', 'combination'],
    ['boş katman', [[['layers'], []]], 'layers', 'range'],
    ['başlangıç', [[['layers', 0, 'startSeconds'], 0.25]], 'layers[0].startSeconds', 'range'],
    [
      'master birleşimi',
      [[['master'], { normalize: 'peak', gainDb: 3 }]],
      'master.gainDb',
      'combination',
    ],
    [
      'master birleşimi (none)',
      [[['master'], { normalize: 'none', peakDbfs: -3 }]],
      'master.peakDbfs',
      'combination',
    ],
    [
      'sönüm süresi',
      [[['master'], { fadeInSeconds: 0.2, fadeOutSeconds: 0.1 }]],
      'master',
      'combination',
    ],
    ['açıklama', [[['description'], 7]], 'description', 'type'],
    [
      'çok fazla rezonatör',
      [[['layers', 0, 'resonators'], new Array(9).fill(BODY_LAYER.resonators?.[0])]],
      'layers[0].resonators',
      'range',
    ],
    [
      'çok fazla efekt',
      [[['effects'], new Array(9).fill({ primitive: 'effect.reverb', version: 1 })]],
      'effects',
      'range',
    ],
    [
      'otomasyon almayan alan',
      [gesture([[0, 1]]), [[...RES, 'q'], { gesture: 'g' }]],
      'layers[0].resonators[0].params.q',
      'combination',
    ],
    [
      'tanımsız gesture',
      [[[...RES, 'frequency'], { gesture: 'nope' }]],
      'layers[0].resonators[0].params.frequency.gesture',
      'unknown-id',
    ],
    ['kullanılmayan gesture', [gesture([[0, 1]])], 'gestures.g', 'combination'],
    [
      'bilinmeyen eğri',
      [gesture([[0, 500]], 'curve.bezier'), [[...RES, 'frequency'], { gesture: 'g' }]],
      'gestures.g.curve',
      'unknown-id',
    ],
    [
      'geri giden zaman',
      [
        gesture([
          [0.1, 500],
          [0.05, 600],
        ]),
        [[...RES, 'frequency'], { gesture: 'g' }],
      ],
      'gestures.g.points[1][0]',
      'range',
    ],
    [
      'nokta biçimi',
      [[['gestures'], { g: { curve: 'curve.linear', version: 1, points: [[0, 1, 2]] } }]],
      'gestures.g.points[0]',
      'type',
    ],
    [
      'boş nokta listesi',
      [[['gestures'], { g: { curve: 'curve.linear', version: 1, points: [] } }]],
      'gestures.g.points',
      'range',
    ],
    ['gesture tipi', [[['gestures'], []]], 'gestures', 'type'],
  ])('%s', (_label, edits, path, issue) => rejects(edited(base, ...edits), path, issue));

  it('gesture noktası bağlandığı parametrenin aralığıyla sınanır', () => {
    const program = edited(
      base,
      gesture([
        [0, 500],
        [0.1, 12000],
      ]),
      [[...RES, 'frequency'], { gesture: 'g' }],
    );
    expect(() => resolveProgram(program)).toThrow(/gestures\.g\.points\[1\]\[1\]→layers\[0\]/);
  });

  it('varsayılanlar registry’den gelir; program belgesi değişmez', () => {
    const program = edited(base, [[...RES, 'q'], undefined]);
    expect(resolveProgram(program).layers[0].resonators[0].params.q).toBe(0.707);
    expect(JSON.stringify(program)).not.toContain('"q"');
  });
});

describe('program render sözleşmesi', () => {
  const base = baseProgram();
  const none: AcousticProgramV1 = { ...base, master: { normalize: 'none' } };

  it('aynı program + tohum aynı PCM; tohum ezmesi farklı PCM', () => {
    const a = renderProgram(base);
    expect(same(a.channels, renderProgram(baseProgram()).channels)).toBe(true);
    const c = renderProgram(base, { seed: 12 });
    expect(c.seed).toBe(12);
    expect(same(a.channels, c.channels)).toBe(false);
  });

  it('alt akış katman ADINA bağlı: yeni katman eklemek mevcut gürültüyü kaydırmaz', () => {
    const solo = renderProgram(none);
    const extra = {
      name: 'extra',
      source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
      gainDb: -120,
    };
    const withExtra = renderProgram({ ...none, layers: [extra, BODY_LAYER] });
    const maxDiff = solo.channels[0].reduce(
      (m, v, i) => Math.max(m, Math.abs(v - withExtra.channels[0][i])),
      0,
    );
    expect(maxDiff).toBeLessThan(1e-5);
  });

  it('katman adı değişirse gürültü akışı değişir (etiket kimliktir)', () => {
    const renamed = renderProgram({ ...base, layers: [{ ...BODY_LAYER, name: 'other' }] });
    expect(same(renderProgram(base).channels, renamed.channels)).toBe(false);
  });

  it('peak normalize hedefi tutulur; none modu kazancı aynen uygular', () => {
    const peak = renderProgram({ ...base, master: { peakDbfs: -6 } });
    const max = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(20 * Math.log10(max(peak.channels[0]))).toBeCloseTo(-6, 3);
    const quiet = renderProgram({ ...base, master: { normalize: 'none', gainDb: -20 } });
    const loud = renderProgram({ ...base, master: { normalize: 'none', gainDb: 0 } });
    expect(20 * Math.log10(max(loud.channels[0]) / max(quiet.channels[0]))).toBeCloseTo(20, 1);
  });

  it('stereo pan ve reverb efekti iki kanalı ayrıştırır', () => {
    // Reverb'ün L/R çekirdekleri bağımsızdır: tam sola panlanmış ses sağ kuyruk üretmez.
    const out = renderProgram({
      ...base,
      channels: 2,
      layers: [{ ...BODY_LAYER, pan: -0.6 }],
      effects: [{ primitive: 'effect.reverb', version: 1, params: { decay: 0.3, amount: 1 } }],
    });
    expect(out.channels).toHaveLength(2);
    const energy = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0);
    expect(energy(out.channels[0])).toBeGreaterThan(energy(out.channels[1]));
    expect(energy(out.channels[1])).toBeGreaterThan(0);
  });

  it('mono programda reverb tek çekirdekle çalışır', () => {
    const dry = renderProgram(none).channels[0];
    const wet = renderProgram({
      ...none,
      effects: [{ primitive: 'effect.reverb', version: 1, params: { amount: 1 } }],
    }).channels[0];
    expect(same([dry], [wet])).toBe(false);
  });

  it('paralel rezonatörler kaynağın KOPYASINI işler, seri zincir sırayla', () => {
    const band = (frequency: number) => ({
      primitive: 'resonator.biquad',
      version: 1,
      params: { mode: 'bandpass', frequency, q: 10 },
    });
    const two = (routing: 'series' | 'parallel') =>
      renderProgram({
        ...none,
        layers: [{ ...BODY_LAYER, routing, resonators: [band(500), band(3000)] }],
      }).channels[0];
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    // İki dar bant seri bağlanınca ortak bant neredeyse boştur; paralelde iki bant toplanır.
    expect(rms(two('parallel'))).toBeGreaterThan(5 * rms(two('series')));
  });

  it('gecikmeli ve kısa katman yalnız kendi aralığında çalar', () => {
    const out = renderProgram({
      ...base,
      master: { normalize: 'none', fadeOutSeconds: 0 },
      layers: [{ ...BODY_LAYER, startSeconds: 0.1, durationSeconds: 0.05 }],
    });
    const x = out.channels[0];
    const rate = out.sampleRate;
    expect(x.slice(0, Math.floor(0.1 * rate)).every((v) => v === 0)).toBe(true);
    const after = x.slice(Math.floor(0.15 * rate) + 1, Math.floor(0.2 * rate));
    expect(after.every((v) => Math.abs(v) < 1e-3)).toBe(true);
  });

  it('bütçe AYIRMADAN önce: uzun + çok katmanlı program RenderBudgetError', () => {
    const resonators = Array.from({ length: 8 }, () => BODY_LAYER.resonators![0]);
    const heavy: AcousticProgramV1 = {
      ...base,
      sampleRate: 192000,
      durationSeconds: 600,
      layers: Array.from({ length: 32 }, (_, i) => ({ ...BODY_LAYER, name: `l${i}`, resonators })),
    };
    expect(estimateProgramCost(resolveProgram(heavy)).workUnits).toBeGreaterThan(6e9);
    expect(() => renderProgram(heavy)).toThrow(RenderBudgetError);
  });

  it('maliyet katman sayısıyla doğrusal büyür (iş), bellek en ağır katmanla sınırlı', () => {
    const one = estimateProgramCost(resolveProgram(base));
    const layers = [0, 1, 2, 3].map((i) => ({ ...BODY_LAYER, name: `l${i}` }));
    const four = estimateProgramCost(resolveProgram({ ...base, layers }));
    expect(four.workUnits).toBeGreaterThan(2.5 * one.workUnits);
    expect(four.peakBytes).toBe(one.peakBytes);
  });

  it('dar bütçe verilince kendi bütçesiyle reddeder; tohum ezmesi doğrulanır', () => {
    const budget = { maxPeakBytes: 1e9, maxWorkUnits: 10 };
    expect(() => renderProgram(base, { budget })).toThrow(RenderBudgetError);
    expect(() => renderProgram(base, { seed: 1.5 })).toThrow(AudioParamError);
  });
});

describe('gesture örnekleme semantiği', () => {
  const run = (points: [number, number][], frames = 10, rate = 10) => {
    const out = new Float32Array(frames);
    renderGesture(points, LINEAR_CURVE, out, rate);
    return Array.from(out);
  };

  it('ilk noktadan önce ilk değer, sondan sonra son değer tutulur', () => {
    expect(
      run([
        [0.3, 2],
        [0.5, 4],
      ]),
    ).toEqual([2, 2, 2, 2, 3, 4, 4, 4, 4, 4]);
  });

  it('eşit zamanlı iki nokta anlık basamaktır', () => {
    expect(
      run([
        [0, 0],
        [0.4, 0],
        [0.4, 10],
        [1, 10],
      ]),
    ).toEqual([0, 0, 0, 0, 10, 10, 10, 10, 10, 10]);
  });

  it('tek nokta sabit eğridir; zaman i/oran ile birikimsiz hesaplanır', () => {
    expect(run([[0, 7]])).toEqual(new Array<number>(10).fill(7));
    const long = run(
      [
        [0, 0],
        [1000, 1000],
      ],
      48000 * 4,
      48000,
    );
    expect(long[48000 * 4 - 1]).toBeCloseTo((48000 * 4 - 1) / 48000, 3);
  });
});
