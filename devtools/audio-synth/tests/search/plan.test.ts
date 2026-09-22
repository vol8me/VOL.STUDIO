import { describe, expect, it } from 'vitest';
import { BatchBudgetError } from '../../src/guard/batch';
import { assertPlanWithinBudget, planSearch } from '../../src/search/plan';
import { buildSearchReport, executeSearch } from '../../src/search/report';
import { validateSearchSpec } from '../../src/search/spec';
import { programSpec, shellSpec } from './fixtures';

const plan = (doc: unknown) => planSearch(validateSearchSpec(doc));

const layer = (name: string, modes: number) => ({
  name,
  source: { primitive: 'exciter.impact', version: 1 },
  resonators: [{ primitive: 'resonator.modal', version: 1, params: { modes } }],
});

describe('arama planı (ön-denetim, render yok)', () => {
  it('spec dışlama kuralı ve archetype kısıtı adayı render ÖNCESİ gerekçesiyle geçersiz kılar', () => {
    const excluded = plan(
      shellSpec({
        constraints: [
          {
            kind: 'exclude',
            when: [{ dimension: 'layout', equals: 'membrane' }],
            reason: 'zar bu aramada yok',
          },
        ],
      }),
    );
    const byConstraint = excluded.candidates.filter((c) => c.invalid?.stage === 'constraint');
    expect(byConstraint.length).toBeGreaterThan(0);
    for (const c of byConstraint) {
      expect(c.values.layout).toBe('membrane');
      expect(c).toMatchObject({
        program: null,
        candidateId: null,
        cost: null,
        invalid: { message: 'zar bu aramada yok', path: 'constraints[0]' },
      });
    }

    const fluid = plan({
      ...shellSpec(),
      base: {
        kind: 'archetype',
        request: {
          schema: 'ArchetypeRequestV1',
          archetype: 'archetype.fluid-creature',
          version: 1,
          variation: 0,
        },
      },
      dimensions: [
        {
          name: 'activity',
          target: { kind: 'archetype-param', param: 'activity' },
          range: { min: 0, max: 1, scale: 'linear', unit: 'normalized' },
        },
        {
          name: 'duration',
          target: { kind: 'archetype-param', param: 'durationSeconds' },
          range: { min: 0.3, max: 1, scale: 'linear', unit: 's' },
        },
      ],
      candidates: 16,
    });
    const byArchetype = fluid.candidates.filter((c) => c.invalid?.stage === 'materialize');
    expect(byArchetype.length).toBeGreaterThan(0);
    expect(byArchetype[0].invalid).toMatchObject({ code: 'combination', path: 'params' });
    const executed = executeSearch(fluid);
    for (const c of executed.filter((x) => x.rejection?.stage === 'materialize')) {
      expect(c).toMatchObject({ state: 'invalid', render: null, descriptors: null, checks: null });
    }
  });

  it('seçenek uzayı tükenince yinelenen program render edilmez; ikizine işaret eder', () => {
    const spec = programSpec({
      candidates: 6,
      dimensions: [
        {
          name: 'layout',
          target: {
            kind: 'node-param',
            layer: 'body',
            slot: 'resonator',
            index: 0,
            primitive: 'resonator.modal',
            param: 'layout',
          },
          options: ['bar', 'membrane'],
        },
      ],
    });
    const p = plan(spec);
    const unique = p.candidates.filter((c) => c.invalid === null);
    const twins = p.candidates.filter((c) => c.invalid?.stage === 'duplicate');
    expect(unique).toHaveLength(2);
    expect(twins).toHaveLength(4);
    for (const t of twins)
      expect(unique.map((u) => u.candidateId)).toContain(t.invalid?.message.split(' ')[0]);
  });

  it('tek adayın render bütçesi aşımı o adayı geçersiz kılar; plan yine bütçe içinde olabilir', () => {
    const p = plan(
      programSpec({
        base: {
          kind: 'program',
          program: {
            schema: 'AcousticProgramV1',
            sampleRate: 48000,
            channels: 1,
            durationSeconds: 600,
            seed: 1,
            layers: [layer('a', 1), layer('b', 32)],
          },
        },
        candidates: 2,
        dimensions: [
          {
            name: 'modes',
            target: {
              kind: 'node-param',
              layer: 'a',
              slot: 'resonator',
              index: 0,
              primitive: 'resonator.modal',
              param: 'modes',
            },
            options: [1, 32],
          },
        ],
      }),
    );
    const states = Object.fromEntries(
      p.candidates.map((c) => [c.values.modes, c.invalid?.stage ?? 'valid']),
    );
    expect(states).toEqual({ 1: 'valid', 32: 'render-budget' });
    expect(p.verdict.withinBudget).toBe(true);
  });

  it('toplu bütçe: öğe, bellek, iş ve süre aşımı adlı kaynakla reddedilir', () => {
    const cases: [Record<string, number>, string][] = [
      [{ maxItems: 4 }, 'items'],
      [{ maxItemPeakBytes: 1000 }, 'memory'],
      [{ maxTotalWorkUnits: 1000 }, 'work'],
      [{ maxEstimatedSeconds: 0.001 }, 'time'],
    ];
    for (const [budget, resource] of cases) {
      const p = plan(shellSpec({ budget }));
      expect(p.verdict).toMatchObject({ withinBudget: false, resource });
      expect(() => assertPlanWithinBudget(p)).toThrow(BatchBudgetError);
    }
    expect(plan(shellSpec()).verdict.withinBudget).toBe(true);
  });

  it('PolyBLEP riskli bölgesindeki aday işaretlenir, altındaki işaretlenmez', () => {
    const p = plan(
      programSpec({
        base: {
          kind: 'program',
          program: {
            schema: 'AcousticProgramV1',
            sampleRate: 48000,
            channels: 1,
            durationSeconds: 0.2,
            seed: 1,
            layers: [
              {
                name: 'tone',
                source: {
                  primitive: 'source.oscillator',
                  version: 1,
                  params: { waveform: 'sawtooth', frequency: 200 },
                },
              },
            ],
          },
        },
        candidates: 6,
        dimensions: [
          {
            name: 'f',
            target: {
              kind: 'node-param',
              layer: 'tone',
              slot: 'source',
              primitive: 'source.oscillator',
              param: 'frequency',
            },
            range: { min: 300, max: 3000, scale: 'log', unit: 'Hz' },
          },
        ],
      }),
    );
    for (const c of p.candidates) {
      expect(c.risks, `f=${c.values.f}`).toEqual(
        (c.values.f as number) > 1000 ? ['polyblep-alias'] : [],
      );
    }
  });

  it('arama tohum ezmesi DEĞİLDİR: adaylar aynı program tohumunu taşır, boyut değerleriyle ayrışır', () => {
    const p = plan(shellSpec());
    const valid = p.candidates.filter((c) => c.program);
    expect(new Set(valid.map((c) => c.program?.seed)).size).toBe(1);
    expect(new Set(valid.map((c) => c.programHash)).size).toBe(valid.length);
  });

  it('aday kimliği sayıdan bağımsızdır (önek kararlı) ve plan deterministiktir', () => {
    const four = plan(shellSpec({ candidates: 4 })).candidates.map((c) => c.candidateId);
    const eight = plan(shellSpec({ candidates: 8 })).candidates.map((c) => c.candidateId);
    expect(eight.slice(0, 4)).toEqual(four);
    expect(plan(shellSpec()).candidates).toEqual(plan(shellSpec()).candidates);
  });
});

describe('arama yürütmesi', () => {
  it('filtrelenen aday render/ölçüm/denetim kanıtıyla ve gerekçesiyle raporda kalır', () => {
    const p = plan(
      shellSpec({
        filters: [{ kind: 'clipping' }, { kind: 'descriptor', descriptor: 'centroidHz', max: 450 }],
      }),
    );
    const report = buildSearchReport(p, executeSearch(p));
    const filtered = report.candidates.filter((c) => c.state === 'filtered');
    const passed = report.candidates.filter((c) => c.state === 'passed');
    expect(filtered.length).toBeGreaterThan(0);
    expect(passed.length).toBeGreaterThan(0);
    for (const c of filtered) {
      expect(c.render?.pcmHash).toMatch(/^sha256:/);
      expect(c.descriptors?.centroidHz).toBeGreaterThan(450);
      expect(c.rejection).toMatchObject({
        stage: 'filter',
        code: 'descriptor',
        path: 'filters[1]',
      });
      expect(c.checks?.[1]).toMatchObject({ pass: false, measured: c.descriptors?.centroidHz });
    }
    expect(report.summary).toEqual({
      passed: passed.length,
      filtered: filtered.length,
      error: 0,
      invalid: 0,
    });
    expect(Object.keys(report)).not.toContain('score');
    expect(JSON.stringify(report)).not.toMatch(/"(score|quality|organic)"/);
  });

  it('aynı plan aynı PCM özetlerini verir (süreç içi)', () => {
    const a = executeSearch(plan(shellSpec())).map((c) => c.render?.pcmHash);
    const b = executeSearch(plan(shellSpec())).map((c) => c.render?.pcmHash);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });
});
