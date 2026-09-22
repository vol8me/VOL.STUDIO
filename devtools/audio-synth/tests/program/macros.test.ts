import { describe, expect, it } from 'vitest';
import { analyzeAudio } from '../../src/analysis/report';
import { AudioParamError, type AudioParamIssue } from '../../src/guard/errors';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { describeEntry } from '../../src/program/describe';
import type { ControlEntry } from '../../src/program/registry';
import { renderProgram } from '../../src/program/render';
import { resolveProgram } from '../../src/program/schema';
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

const wobble = {
  modulators: { wobble: { modulator: 'modulator.walk', version: 1, params: { reversion: 6 } } },
};
const tone = node('source.oscillator', {
  frequency: { value: 440, modulate: [{ by: 'wobble', depth: 0.02 }] },
});

/** Her makro için: sonda programı, ölçülen boyut ve registry'de YAZILI yön. */
const PROBES: Record<string, { layers: unknown[]; measure: Measure; extra?: object }> = {
  'control.body-size': {
    layers: [{ name: 'b', source: impact, resonators: [modal()] }],
    measure: pitch,
  },
  'control.tension': {
    layers: [{ name: 'b', source: impact, resonators: [modal()] }],
    measure: pitch,
  },
  'control.pressure': {
    layers: [{ name: 'b', source: turbulence, articulation: node('articulation.amplitude') }],
    measure: loudness,
  },
  'control.wetness': {
    layers: [{ name: 'b', source: impact, resonators: [modal({ modes: 16, brightness: 0.9 })] }],
    measure: brightness,
  },
  'control.viscosity': {
    layers: [{ name: 'b', source: impact, resonators: [modal()] }],
    measure: decay,
  },
  'control.roughness': { layers: [{ name: 'b', source: turbulence }], measure: noisiness },
  'control.cavity-size': {
    layers: [{ name: 'b', source: turbulence, resonators: [node('resonator.cavity', { q: 30 })] }],
    measure: pitch,
  },
  'control.airiness': { layers: [{ name: 'b', source: turbulence }], measure: noisiness },
  'control.instability': {
    layers: [{ name: 'b', source: tone }],
    measure: irregularity,
    extra: wobble,
  },
};

const controls = PROGRAM_REGISTRY.entries().filter((e): e is ControlEntry => e.kind === 'control');

describe('makro akustik kontroller — yön ilişkileri registry’deki gibi', () => {
  it('her makronun bir sondası var (yeni makro sondasız kalamaz)', () => {
    expect(Object.keys(PROBES).sort()).toEqual(controls.map((c) => c.id));
  });

  it.each(controls.map((c) => [c.id, c] as const))('%s', (_id, entry) => {
    const probe = PROBES[entry.id];
    const [{ direction }] = entry.causal;
    const values = POSITIONS.map((c) =>
      probe.measure(renderProgram(program(entry.id, c, probe.layers, probe.extra)).channels[0]),
    );
    expect(
      isStrictlyMonotone(values, direction),
      `${entry.id}: ${values.map((v) => v.toFixed(3)).join(' → ')}`,
    ).toBe(true);
  });

  it('0.5 nötrdür: makrolu ve makrosuz program aynı PCM’i verir', () => {
    const layers = PROBES['control.body-size'].layers;
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
  const layers = PROBES['control.body-size'].layers;

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
