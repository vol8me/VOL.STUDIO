import { describe, expect, it } from 'vitest';
import { expandArchetype } from '../../src/program/archetype';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { describeRegistry } from '../../src/program/describe';
import type { NumberParamSpec } from '../../src/program/params';
import type { ProgramEntry } from '../../src/program/registry';
import { renderProgram } from '../../src/program/render';
import { buildContext } from '../../src/protocol/context';
import { createTestRepo } from '../protocol/repo';
import { probeResolver, probeSample } from '../support/samples';

/**
 * Registry metadata'sı agent'ın TEK kaynağıdır: eksik birim/aralık/açıklama,
 * yön ilişkisi yazılmamış parametre ya da implementasyona bağlı olmayan
 * (değiştirince sesi değiştirmeyen) parametre bu kapıda düşer.
 */
const entries = PROGRAM_REGISTRY.entries();
const nodes = entries.filter((e) => e.kind !== 'curve');
const RATE = 48000;

function alternative(spec: NumberParamSpec): number {
  const up = spec.default + (spec.max - spec.default) * 0.1;
  const value = spec.default < spec.max ? up : spec.default - (spec.default - spec.min) * 0.1;
  const bounded = spec.belowNyquist ? Math.min(value, RATE / 2 - 1000) : value;
  if (!spec.integer) return bounded;
  const rounded = Math.round(bounded);
  if (rounded !== spec.default) return rounded;
  return spec.default < spec.max ? spec.default + 1 : spec.default - 1;
}

const PROBE_BASE = {
  schema: 'AcousticProgramV1',
  sampleRate: RATE,
  channels: 1,
  durationSeconds: 2,
  seed: 3,
  master: { normalize: 'none', fadeOutSeconds: 0 },
};
const noise = { primitive: 'source.noise', version: 1 };
const impact = { primitive: 'exciter.impact', version: 1 };

/** `sample` türü parametreler için farklı kayıtlar; alternatif değer diğer addır. */
const PROBE_SAMPLES: Record<string, ReturnType<typeof probeSample>> = {
  a: probeSample(0),
  b: probeSample(1),
  c: probeSample(2),
  d: probeSample(3),
};

/**
 * Sampler bankaları: `a` velocity ≤ 0.81 tek bölge, üstünde üç round-robin
 * bölgesi (yoklama velocity 0.9 → olay sırası seçimi değiştirir); `b` başka kök.
 */
const PROBE_BANKS: Record<string, { zones: Record<string, unknown>[]; samples: string[] }> = {
  a: {
    samples: ['a', 'b', 'c', 'd'],
    zones: [
      { sample: 'a', rootKey: 60, keyLow: 0, keyHigh: 127, velocityHigh: 0.81 },
      ...['b', 'c', 'd'].map((sample) => ({
        sample,
        rootKey: 60,
        keyLow: 0,
        keyHigh: 127,
        velocityLow: 0.81,
      })),
    ],
  },
  b: { samples: ['b'], zones: [{ sample: 'b', rootKey: 48, keyLow: 0, keyHigh: 127 }] },
};

/** Yoklamaya sample/banka parametresi olan kayıtta bildirim eklenir (kullanılmayan bildirim reddedilir). */
function withSamples(
  entry: ProgramEntry,
  program: Record<string, unknown>,
  params: Record<string, unknown>,
) {
  const refs = Object.entries(entry.params).filter(([, spec]) => spec.type === 'sample');
  if (refs.length === 0) return program;
  const samples = new Set<string>();
  const banks: Record<string, unknown> = {};
  for (const [name, spec] of refs) {
    const value = typeof params[name] === 'string' ? params[name] : 'a';
    if (spec.type === 'sample' && spec.of === 'bank') {
      banks[value] = { schema: 'SampleBankV1', zones: PROBE_BANKS[value].zones };
      PROBE_BANKS[value].samples.forEach((sample) => samples.add(sample));
    } else {
      samples.add(value);
    }
  }
  return {
    ...program,
    samples: Object.fromEntries([...samples].map((name) => [name, PROBE_SAMPLES[name].decl])),
    ...(Object.keys(banks).length > 0 ? { banks } : {}),
  };
}

function baseParams(entry: ProgramEntry, params: Record<string, unknown>): Record<string, unknown> {
  const refs = Object.fromEntries(
    Object.entries(entry.params)
      .filter(([, spec]) => spec.type === 'sample')
      .map(([name]) => [name, 'a']),
  );
  return { ...refs, ...(entry.probe?.params ?? {}), ...params };
}

function node(id: string, params: Record<string, unknown> = {}) {
  const entry = PROGRAM_REGISTRY.entries().find((e) => e.id === id) as ProgramEntry;
  return { primitive: id, version: entry.version, params };
}

/** Yapı taşını kendi türünün yuvasına koyan tek katman. */
function layerFor(id: string, params: Record<string, unknown>, name: string) {
  const kind = id.split('.')[0];
  if (kind === 'source' || kind === 'exciter') return { name, source: node(id, params) };
  if (kind === 'resonator') return { name, source: impact, resonators: [node(id, params)] };
  if (kind === 'articulation') return { name, source: noise, articulation: node(id, params) };
  return { name, source: noise };
}

/**
 * Düğümü en küçük programa koyar. Modülatör bir osilatörün frekansını,
 * makro ise hedeflerinin her birini taşıyan birer katmanı sürer.
 */
function programWith(entry: ProgramEntry, raw: Record<string, unknown>): unknown {
  const params = entry.kind === 'archetype' ? raw : baseParams(entry, raw);
  const stereo = entry.probe?.channels === 2 || (entry.kind === 'source' && entry.renderStereo);
  const base = { ...PROBE_BASE, channels: stereo ? 2 : 1 };
  return withSamples(entry, probeProgram(entry, params, base), params);
}

function probeProgram(
  entry: ProgramEntry,
  params: Record<string, unknown>,
  PROBE_BASE: Record<string, unknown>,
): Record<string, unknown> {
  if (entry.kind === 'archetype') {
    return {
      ...expandArchetype({
        schema: 'ArchetypeRequestV1',
        archetype: entry.id,
        version: entry.version,
        variation: 0,
        params,
      }),
    };
  }
  if (entry.kind === 'effect') {
    if (entry.probe?.signal === 'impulsive') {
      const hit = {
        source: impact,
        resonators: [{ primitive: 'resonator.modal', version: 1, params: { decay: 0.6 } }],
      };
      const layers = [0, 0.7, 1.4].map((at, i) => ({ name: `hit${i}`, startSeconds: at, ...hit }));
      return { ...PROBE_BASE, layers, effects: [node(entry.id, params)] };
    }
    const layers =
      PROBE_BASE.channels === 2
        ? [
            { name: 'left', source: noise, pan: -1 },
            { name: 'right', source: noise, pan: 0.6, gainDb: -4 },
          ]
        : [{ name: 'probe', source: noise }];
    return { ...PROBE_BASE, layers, effects: [node(entry.id, params)] };
  }
  if (entry.kind === 'modulator') {
    const tone = node('source.oscillator', {
      frequency: { value: 440, modulate: [{ by: 'm', depth: 0.05 }] },
    });
    return {
      ...PROBE_BASE,
      modulators: { m: { modulator: entry.id, version: entry.version, params } },
      layers: [{ name: 'probe', source: tone }],
    };
  }
  if (entry.kind === 'control') {
    const control = { control: entry.id, version: entry.version, value: params.value ?? 0.5 };
    if (entry.modulationDepth) {
      const tone = node('source.oscillator', {
        frequency: { value: 440, modulate: [{ by: 'm', depth: 0.05 }] },
      });
      return {
        ...PROBE_BASE,
        controls: [control],
        modulators: { m: { modulator: 'modulator.walk', version: 1 } },
        layers: [{ name: 'probe', source: tone }],
      };
    }
    const ids = [...new Set(entry.targets.map((t) => t.primitive))];
    return {
      ...PROBE_BASE,
      controls: [control],
      layers: ids.map((id, i) => layerFor(id, {}, `t${i}`)),
    };
  }
  return { ...PROBE_BASE, layers: [layerFor(entry.id, params, 'probe')] };
}

const fingerprint = (program: unknown) => {
  let h = 0;
  for (const x of renderProgram(program, { samples: probeResolver }).channels) {
    for (let i = 0; i < x.length; i += 7) h = (h * 31 + Math.round(x[i] * 1e6)) | 0;
  }
  return h;
};

describe('registry governance', () => {
  it.each(entries.map((e) => [e.id, e] as const))('%s: metadata eksiksiz', (_id, entry) => {
    expect(Number.isInteger(entry.version) && entry.version >= 1).toBe(true);
    expect(entry.description.length).toBeGreaterThan(20);
    expect(entry.capabilities.length).toBeGreaterThan(0);
    for (const tag of entry.capabilities) expect(tag).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(entry.determinism.stochastic).toBe(entry.determinism.substreams.length > 0);
    expect(entry.resource.model.length).toBeGreaterThan(0);
    const defaults = Object.fromEntries(
      Object.entries(entry.params).map(([k, s]) => [k, s.type === 'sample' ? '' : s.default]),
    );
    expect(Number.isFinite(entry.resource.workPerFrame(defaults, new Set()))).toBe(true);
    expect(entry.resource.stateBytes(defaults, RATE)).toBeGreaterThanOrEqual(0);
    for (const [name, spec] of Object.entries(entry.params)) {
      expect(spec.description.length, `${name} açıklaması`).toBeGreaterThan(3);
      if (spec.type === 'choice') {
        expect(spec.choices).toContain(spec.default);
        continue;
      }
      if (spec.type === 'sample') continue;
      expect(spec.unit.length).toBeGreaterThan(0);
      expect(spec.min).toBeLessThan(spec.max);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(
        entry.causal.some((c) => c.param === name),
        `${entry.id}.${name} için yön ilişkisi (causal) yazılmamış`,
      ).toBe(true);
    }
    for (const effect of entry.causal) expect(Object.keys(entry.params)).toContain(effect.param);
  });

  it.each(nodes.map((e) => [e.id, e] as const))(
    '%s: her parametre GERÇEK implementasyona bağlı',
    (_id, entry) => {
      const base = fingerprint(programWith(entry, {}));
      const probe = entry.probe?.params ?? {};
      for (const [name, spec] of Object.entries(entry.params)) {
        const current = probe[name];
        const values =
          spec.type === 'sample'
            ? ['b']
            : spec.type === 'choice'
            ? spec.choices.filter((c) => c !== (current ?? spec.default))
            : [alternative(typeof current === 'number' ? { ...spec, default: current } : spec)];
        for (const value of values) {
          expect(
            fingerprint(programWith(entry, { [name]: value })),
            `${entry.id}.${name}=${value} sesi değiştirmedi`,
          ).not.toBe(base);
        }
      }
    },
  );

  it('makro hedefleri gerçek, sayısal registry parametrelerine işaret eder', () => {
    for (const entry of entries) {
      if (entry.kind !== 'control') continue;
      expect(entry.targets.length > 0 || entry.modulationDepth !== undefined, entry.id).toBe(true);
      for (const target of entry.targets) {
        const primitive = entries.find((e) => e.id === target.primitive);
        expect(primitive, `${entry.id} → ${target.primitive}`).toBeDefined();
        expect(primitive?.params[target.param]?.type, `${entry.id} → ${target.param}`).toBe(
          'number',
        );
      }
    }
  });

  it('archetype topolojisi yalnız registry’deki yapı taşlarına ve makrolara işaret eder', () => {
    for (const entry of entries) {
      if (entry.kind !== 'archetype') continue;
      expect(entry.variation.guaranteed, entry.id).toBeGreaterThanOrEqual(8);
      for (const id of [...entry.topology.flatMap((l) => l.chain), ...entry.macros]) {
        expect(PROGRAM_REGISTRY.has(id), `${entry.id} → ${id}`).toBe(true);
      }
    }
  });

  it('context çıktısı registry’nin KENDİSİNDEN üretilir: her kayıt otomatik görünür', () => {
    const repo = createTestRepo();
    try {
      const context = buildContext(repo.root);
      expect(context.registry.entries.map((e) => e.id)).toEqual(entries.map((e) => e.id));
      expect(context.registry.entries).toEqual(describeRegistry());
    } finally {
      repo.cleanup();
    }
  });

  it('izdüşüm kimliğe göre sıralı ve JSON’a dökülebilir', () => {
    const ids = describeRegistry().map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
    expect(() => JSON.stringify(describeRegistry())).not.toThrow();
  });
});
