import { describe, expect, it } from 'vitest';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { describeRegistry } from '../../src/program/describe';
import type { NumberParamSpec } from '../../src/program/params';
import type { ProgramEntry } from '../../src/program/registry';
import { renderProgram } from '../../src/program/render';
import { buildContext } from '../../src/protocol/context';
import { createTestRepo } from '../protocol/repo';

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
  return spec.integer ? Math.round(bounded) || spec.default + 1 : bounded;
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
function programWith(entry: ProgramEntry, params: Record<string, unknown>): unknown {
  if (entry.kind === 'effect') {
    return {
      ...PROBE_BASE,
      layers: [{ name: 'probe', source: noise }],
      effects: [node(entry.id, params)],
    };
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
  const x = renderProgram(program).channels[0];
  let h = 0;
  for (let i = 0; i < x.length; i += 7) h = (h * 31 + Math.round(x[i] * 1e6)) | 0;
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
      Object.entries(entry.params).map(([k, s]) => [k, s.default]),
    );
    expect(Number.isFinite(entry.resource.workPerFrame(defaults, new Set()))).toBe(true);
    expect(entry.resource.stateBytes(defaults, RATE)).toBeGreaterThanOrEqual(0);
    for (const [name, spec] of Object.entries(entry.params)) {
      expect(spec.description.length, `${name} açıklaması`).toBeGreaterThan(3);
      if (spec.type === 'choice') {
        expect(spec.choices).toContain(spec.default);
        continue;
      }
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
      for (const [name, spec] of Object.entries(entry.params)) {
        const values =
          spec.type === 'choice'
            ? spec.choices.filter((c) => c !== spec.default)
            : [alternative(spec)];
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
