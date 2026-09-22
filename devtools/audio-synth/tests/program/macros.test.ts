import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError, type AudioParamIssue } from '../../src/guard/errors';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { describeEntry } from '../../src/program/describe';
import type { ControlEntry } from '../../src/program/registry';
import { renderProgram } from '../../src/program/render';
import { resolveProgram } from '../../src/program/schema';
import { blackmanHarris, powerSpectrum } from '../../src/analysis/spectrum';
import { autocorrelationPitch, isStrictlyMonotone, peakFrequency } from '../support/measure';

const RATE = 48000;
const POSITIONS = [0.15, 0.35, 0.5, 0.65, 0.85];

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
const impact = node('exciter.impact', { contactTime: 0.0005, roughness: 0 });
const turbulence = node('exciter.turbulence');
const modal = (params: Record<string, unknown> = {}) =>
  node('resonator.modal', { frequency: 300, brightness: 0, ...params });

function program(control: string, value: number, layers: unknown[], extra: object = {}) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: RATE,
    channels: 1,
    durationSeconds: 3,
    seed: 17,
    controls: [{ control, version: 1, value }],
    layers,
    master: { normalize: 'none', fadeOutSeconds: 0 },
    ...extra,
  };
}

type Measure = (x: Float32Array) => number;
const report = (x: Float32Array) => analyzeAudio([x], RATE, 'source-pcm');
const pitch: Measure = (x) => peakFrequency(x, RATE, 0, 32768, [60, 2000]);
const brightness: Measure = (x) => report(x).spectral.centroidHz ?? 0;
const loudness: Measure = (x) => report(x).level.rmsDbfs ?? -Infinity;
const decay: Measure = (x) => report(x).temporal.decay40Seconds ?? Infinity;
const noisiness: Measure = (x) => report(x).spectral.flatness ?? 0;
const irregularity: Measure = (x) => {
  const f = Array.from({ length: 40 }, (_, k) =>
    autocorrelationPitch(x, RATE, 2000 + k * 3000, 1200, 300, 600),
  );
  const mean = f.reduce((a, b) => a + b) / f.length;
  return Math.sqrt(f.reduce((a, v) => a + (v - mean) ** 2, 0) / f.length);
};

/** Olay başlangıcı sayısı: 2 ms enerji zarfında, tepeden −40 dB üstünde 4× sıçrama. */
const onsets: Measure = (x) => {
  const hop = 96;
  const energy: number[] = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + hop; k++) e += x[k] * x[k];
    energy.push(e);
  }
  const floor = Math.max(...energy) * 1e-4;
  return energy.filter((e, i) => i > 0 && e > floor && e > 4 * energy[i - 1]).length;
};
/** f₀/2 bandındaki gücün f₀ bandına oranı (200 Hz glottal kaynak için). */
const subharmonicRatio: Measure = (x) => bandPower(x, 100) / Math.max(1e-30, bandPower(x, 200));
function bandPower(x: Float32Array, f: number): number {
  const size = 32768;
  const power = powerSpectrum(x, 4800, size, blackmanHarris(size));
  const k = Math.round((f * size) / RATE);
  return power[k - 1] + power[k] + power[k + 1];
}

const wobble = {
  modulators: { wobble: { modulator: 'modulator.walk', version: 1, params: { reversion: 6 } } },
};
const tone = node('source.oscillator', {
  frequency: { value: 440, modulate: [{ by: 'wobble', depth: 0.02 }] },
});

/** Her makro için: sonda programı, ölçülen boyut ve registry'de YAZILI yön. */
const bodyProbe = { layers: [{ name: 'b', source: impact, resonators: [modal()] }] };
const glottal = node('source.glottal', {
  frequency: 200,
  jitter: 0,
  shimmer: 0,
  breath: 0,
  subharmonic: 0.3,
});

/**
 * Her makronun HER yön ilişkisi (`id:boyut`) için: sonda programı ve ölçüm.
 * Registry'ye yeni bir yön yazılırsa sondasız kalamaz (ilk test).
 */
const PROBES: Record<string, { layers: unknown[]; measure: Measure; extra?: object }> = {
  'control.body-size:pitch': { ...bodyProbe, measure: pitch },
  'control.tension:pitch': { ...bodyProbe, measure: pitch },
  'control.pressure:loudness': {
    layers: [{ name: 'b', source: turbulence, articulation: node('articulation.amplitude') }],
    measure: loudness,
  },
  'control.wetness:brightness': {
    layers: [{ name: 'b', source: impact, resonators: [modal({ modes: 16, brightness: 0.9 })] }],
    measure: brightness,
  },
  'control.wetness:density': {
    layers: [{ name: 'b', source: node('source.bubbles', { sizeSpread: 0, levelSpread: 0 }) }],
    measure: onsets,
  },
  'control.viscosity:decay': { ...bodyProbe, measure: decay },
  'control.roughness:noisiness': {
    layers: [{ name: 'b', source: turbulence }],
    measure: noisiness,
  },
  'control.roughness:roughness': {
    layers: [{ name: 'b', source: glottal }],
    measure: subharmonicRatio,
  },
  'control.cavity-size:pitch': {
    layers: [{ name: 'b', source: turbulence, resonators: [node('resonator.cavity', { q: 30 })] }],
    measure: pitch,
  },
  'control.airiness:noisiness': { layers: [{ name: 'b', source: turbulence }], measure: noisiness },
  'control.instability:irregularity': {
    layers: [{ name: 'b', source: tone }],
    measure: irregularity,
    extra: wobble,
  },
};

const controls = PROGRAM_REGISTRY.entries().filter((e): e is ControlEntry => e.kind === 'control');

describe('makro akustik kontroller — yön ilişkileri registry’deki gibi', () => {
  const relations = controls.flatMap((c) =>
    c.causal.map((effect) => [`${c.id}:${effect.dimension}`, c, effect.direction] as const),
  );

  it('her makronun her yön ilişkisinin bir sondası var (yeni yön sondasız kalamaz)', () => {
    expect(Object.keys(PROBES).sort()).toEqual(relations.map(([key]) => key).sort());
  });

  it.each(relations)('%s', (key, entry, direction) => {
    const probe = PROBES[key];
    const values = POSITIONS.map((c) =>
      probe.measure(renderProgram(program(entry.id, c, probe.layers, probe.extra)).channels[0]),
    );
    expect(
      isStrictlyMonotone(values, direction),
      `${key}: ${values.map((v) => v.toFixed(3)).join(' → ')}`,
    ).toBe(true);
  });

  it('0.5 nötrdür: makrolu ve makrosuz program aynı PCM’i verir', () => {
    const layers = bodyProbe.layers;
    const withMacro = renderProgram(program('control.body-size', 0.5, layers)).channels[0];
    const { controls: _unused, ...plain } = program('control.body-size', 0.5, layers);
    const without = renderProgram(plain).channels[0];
    expect(withMacro.every((v, i) => v === without[i])).toBe(true);
  });

  it('context izdüşümü hedefleri, yasayı ve aralığı açıklar', () => {
    const described = describeEntry(
      controls.find((c) => c.id === 'control.body-size') as ControlEntry,
    );
    expect(described.targets?.map((t) => `${t.primitive}.${t.param}`)).toContain(
      'resonator.modal.frequency',
    );
    expect(described.params.value).toMatchObject({
      unit: 'normalized',
      min: 0,
      max: 1,
      default: 0.5,
    });
    expect(
      describeEntry(controls.find((c) => c.id === 'control.instability') as ControlEntry)
        .modulationDepth,
    ).toEqual({ span: 2 });
  });
});

describe('makro doğrulaması (render öncesi)', () => {
  const rejects = (value: unknown, path: string, issue: AudioParamIssue) => {
    try {
      resolveProgram(value);
    } catch (error) {
      expect(error).toBeInstanceOf(AudioParamError);
      expect({
        path: (error as AudioParamError).path,
        issue: (error as AudioParamError).issue,
      }).toEqual({ path, issue });
      return;
    }
    throw new Error('reddedilmedi');
  };
  const layers = bodyProbe.layers;

  it.each<[string, unknown, string, AudioParamIssue]>([
    [
      'bilinmeyen makro',
      { ...program('control.size', 0.5, layers) },
      'controls[0].control',
      'unknown-id',
    ],
    [
      'sürüm',
      {
        ...program('control.body-size', 0.5, layers),
        controls: [{ control: 'control.body-size', version: 3 }],
      },
      'controls[0].control@version',
      'version',
    ],
    ['aralık', program('control.body-size', 1.5, layers), 'controls[0].value', 'range'],
    [
      'etkisiz makro',
      program('control.cavity-size', 0.3, layers),
      'controls[0].control',
      'combination',
    ],
    [
      'modülasyonsuz kararsızlık',
      program('control.instability', 0.3, layers),
      'controls[0].control',
      'combination',
    ],
    [
      'tekrarlanan makro',
      {
        ...program('control.body-size', 0.5, layers),
        controls: [
          { control: 'control.body-size', version: 1 },
          { control: 'control.body-size', version: 1 },
        ],
      },
      'controls[1].control',
      'combination',
    ],
    [
      'gesture ile otomasyonsuz hedef',
      {
        ...program('control.roughness', 0.5, [{ name: 'i', source: node('exciter.impact') }]),
        gestures: { g: { curve: 'curve.linear', version: 1, points: [[0, 0.2]] } },
        controls: [{ control: 'control.roughness', version: 1, value: { gesture: 'g' } }],
      },
      'controls[0]',
      'combination',
    ],
    [
      'kullanılmayan modülatör',
      { ...program('control.body-size', 0.5, layers), ...wobble },
      'modulators.wobble',
      'combination',
    ],
    [
      'modülatör modüle edilemez',
      {
        ...program('control.instability', 0.5, [{ name: 'b', source: tone }]),
        modulators: {
          wobble: { modulator: 'modulator.walk', version: 1, params: { reversion: { value: 2 } } },
        },
      },
      'modulators.wobble.params.reversion.value',
      'unknown-key',
    ],
  ])('%s', (_label, value, path, issue) => rejects(value, path, issue));

  it('dB parametrede modülasyon derinliği dB’dir; göreli alanda 0.95 sınırı', () => {
    const level = (depth: number) => ({
      ...program('control.pressure', 0.5, [
        {
          name: 'b',
          source: turbulence,
          articulation: node('articulation.amplitude', {
            level: { value: -6, modulate: [{ by: 'w', depth }] },
          }),
        },
      ]),
      modulators: { w: { modulator: 'modulator.shimmer', version: 1 } },
    });
    expect(() => resolveProgram(level(12))).not.toThrow();
    expect(() => resolveProgram(level(30))).toThrow(AudioParamError);
    const relative = {
      ...program('control.instability', 0.5, [
        {
          name: 'b',
          source: node('source.oscillator', {
            frequency: { value: 440, modulate: [{ by: 'wobble', depth: 2 }] },
          }),
        },
      ]),
      ...wobble,
    };
    expect(() => resolveProgram(relative)).toThrow(/0\.95/);
  });
});
