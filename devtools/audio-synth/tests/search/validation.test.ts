import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { checkDimensions, materialize, type ProgramBaseV1 } from '../../src/program/dimensions';
import { planSearch } from '../../src/search/plan';
import { executeSearch, validateSearchReport } from '../../src/search/report';
import { validateDecision, validateSearchSelection } from '../../src/search/selection';
import { excludedBy, validateSearchSpec } from '../../src/search/spec';
import { edited, getAt } from '../support/json';
import { programSpec, shellSpec } from './fixtures';

/**
 * Doğrulama sınırının hata dalları: her geçersiz girdi render'dan ÖNCE, adlı
 * yol ve sorun türüyle reddedilir. Beklenen yol/sorun çiftleri belgeden
 * okunur; motorun ölçümlerinden türetilmez.
 */
function issue(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AudioParamError) return `${error.path} ${error.issue}`;
    throw error;
  }
  return 'kabul edildi';
}

const program = getAt(programSpec(), ['base', 'program']) as Record<string, unknown>;
const withEffect: ProgramBaseV1 = {
  kind: 'program',
  program: {
    ...program,
    effects: [{ primitive: 'effect.reverb', version: 1, params: { amount: 0.2 } }],
  } as never,
};
const withControl: ProgramBaseV1 = {
  kind: 'program',
  program: {
    ...program,
    gestures: {
      g: {
        curve: 'curve.linear',
        version: 1,
        points: [
          [0, 0.2],
          [0.3, 0.8],
        ],
      },
    },
    controls: [{ control: 'control.body-size', version: 1, value: { gesture: 'g' } }],
  } as never,
};
const base: ProgramBaseV1 = { kind: 'program', program: program as never };
const modal = {
  kind: 'node-param',
  layer: 'body',
  slot: 'resonator',
  index: 0,
  primitive: 'resonator.modal',
};
const dims =
  (list: unknown[], b: ProgramBaseV1 = base) =>
  () =>
    checkDimensions(list, 'd', b);
const range = { min: 0.2, max: 0.8, scale: 'linear', unit: 'normalized' };

describe('boyut sözlüğü — hata dalları', () => {
  it.each([
    ['boş liste', [], 'd range'],
    [
      'dokuz boyut',
      Array.from({ length: 9 }, (_, i) => ({
        name: `x${i}`,
        target: { kind: 'control', control: 'control.body-size' },
        range,
      })),
      'd range',
    ],
    [
      'geçersiz ad',
      [{ name: 'Büyük', target: { kind: 'control', control: 'control.body-size' }, range }],
      'd[0].name type',
    ],
    [
      'boş parametre adı',
      [{ name: 'a', target: { ...modal, param: '' }, range }],
      'd[0].target.param type',
    ],
    [
      'kaynak yuvasında indeks',
      [
        {
          name: 'a',
          target: {
            kind: 'node-param',
            layer: 'body',
            slot: 'source',
            index: 0,
            primitive: 'exciter.impact',
            param: 'contactTime',
          },
          range,
        },
      ],
      'd[0].target.index combination',
    ],
    [
      'effect yuvasında katman',
      [
        {
          name: 'a',
          target: {
            kind: 'node-param',
            layer: 'body',
            slot: 'effect',
            index: 0,
            primitive: 'effect.reverb',
            param: 'amount',
          },
          range,
        },
      ],
      'd[0].target.layer combination',
    ],
    [
      'olmayan katman',
      [
        {
          name: 'a',
          target: { ...modal, layer: 'yok', param: 'decay' },
          range: { ...range, unit: 's' },
        },
      ],
      'd[0].target combination',
    ],
    [
      'olmayan rezonatör sırası',
      [
        {
          name: 'a',
          target: { ...modal, index: 3, param: 'decay' },
          range: { ...range, unit: 's' },
        },
      ],
      'd[0].target combination',
    ],
    [
      'olmayan effect',
      [
        {
          name: 'a',
          target: {
            kind: 'node-param',
            slot: 'effect',
            index: 0,
            primitive: 'effect.reverb',
            param: 'amount',
          },
          range,
        },
      ],
      'd[0].target combination',
    ],
    [
      'bilinmeyen düğüm parametresi',
      [{ name: 'a', target: { ...modal, param: 'nope' }, range }],
      'd[0].target.param unknown-id',
    ],
    [
      'bilinmeyen makro',
      [{ name: 'a', target: { kind: 'control', control: 'control.nope' }, range }],
      'd[0].target.control unknown-id',
    ],
    [
      'aynı hedef iki kez',
      [
        { name: 'a', target: { kind: 'control', control: 'control.body-size' }, range },
        { name: 'b', target: { kind: 'control', control: 'control.body-size' }, range },
      ],
      'd[1].target combination',
    ],
    [
      'hem aralık hem seçenek',
      [
        {
          name: 'a',
          target: { kind: 'control', control: 'control.body-size' },
          range,
          options: [0.2, 0.4],
        },
      ],
      'd[0] combination',
    ],
    [
      'ne aralık ne seçenek',
      [{ name: 'a', target: { kind: 'control', control: 'control.body-size' } }],
      'd[0] combination',
    ],
    [
      'tek seçenek',
      [{ name: 'a', target: { ...modal, param: 'layout' }, options: ['bar'] }],
      'd[0].options range',
    ],
    [
      'yinelenen seçenek',
      [{ name: 'a', target: { ...modal, param: 'layout' }, options: ['bar', 'bar'] }],
      'd[0].options combination',
    ],
    [
      'seçenekli parametreye aralık',
      [{ name: 'a', target: { ...modal, param: 'layout' }, range }],
      'd[0].range combination',
    ],
  ])('%s', (_, list, expected) => {
    expect(issue(dims(list))).toBe(expected);
  });

  it('gesture’a bağlı makro boyut olamaz; effect yuvası ve makro ekleme/değiştirme çalışır', () => {
    expect(
      issue(
        dims(
          [{ name: 'a', target: { kind: 'control', control: 'control.body-size' }, range }],
          withControl,
        ),
      ),
    ).toBe('d[0].target combination');
    const effect = checkDimensions(
      [
        {
          name: 'amt',
          target: {
            kind: 'node-param',
            slot: 'effect',
            index: 0,
            primitive: 'effect.reverb',
            param: 'amount',
          },
          range,
        },
      ],
      'd',
      withEffect,
    );
    expect(
      getAt(materialize(withEffect, effect, { amt: 0.7 }), ['effects', 0, 'params', 'amount']),
    ).toBe(0.7);
    const control = checkDimensions(
      [{ name: 'size', target: { kind: 'control', control: 'control.body-size' }, range }],
      'd',
      base,
    );
    const added = materialize(base, control, { size: 0.3 });
    expect(added.controls).toEqual([{ control: 'control.body-size', version: 1, value: 0.3 }]);
    const replaced = materialize({ kind: 'program', program: added }, control, { size: 0.6 });
    expect(replaced.controls).toEqual([{ control: 'control.body-size', version: 1, value: 0.6 }]);
  });

  it('tamsayı parametre aralığı tama yuvarlanır', () => {
    const plan = planSearch(
      validateSearchSpec(
        programSpec({
          candidates: 6,
          dimensions: [
            {
              name: 'modes',
              target: { ...modal, param: 'modes' },
              range: { min: 2, max: 20, scale: 'linear', unit: 'count' },
            },
          ],
        }),
      ),
    );
    for (const c of plan.candidates) expect(Number.isInteger(c.values.modes)).toBe(true);
  });

  it('archetype tabanında bilinmeyen archetype parametresi', () => {
    expect(
      issue(() =>
        validateSearchSpec(edited(shellSpec(), [['dimensions', 0, 'target', 'param'], 'nope'])),
      ),
    ).toBe('dimensions[0].target.param unknown-id');
  });
});

describe('arama spec’i — hata ve kenar dalları', () => {
  const rule = (when: unknown[], reason: unknown = 'r') => ({ kind: 'exclude', when, reason });
  it.each([
    ['yanlış şema', { ...shellSpec(), schema: 'AcousticSearchSpecV2' }, 'schema type'],
    ['geçersiz searchId', { ...shellSpec(), searchId: '../x' }, 'searchId type'],
    ['açıklama metin değil', { ...shellSpec(), description: 5 }, 'description type'],
    [
      'otuz üç filtre',
      { ...shellSpec(), filters: Array(33).fill({ kind: 'clipping' }) },
      'filters range',
    ],
    [
      'on yedi kural',
      shellSpec({ constraints: Array(17).fill(rule([{ dimension: 'size', max: 0.3 }])) }),
      'constraints range',
    ],
    [
      'gerekçesiz kural',
      shellSpec({ constraints: [rule([{ dimension: 'size', max: 0.3 }], '')] }),
      'constraints[0].reason type',
    ],
    ['koşulsuz kural', shellSpec({ constraints: [rule([])] }), 'constraints[0].when range'],
    [
      'seçenekli boyutta aralık',
      shellSpec({ constraints: [rule([{ dimension: 'layout', min: 0 }])] }),
      'constraints[0].when[0] combination',
    ],
    [
      'aralıklı boyutta equals',
      shellSpec({ constraints: [rule([{ dimension: 'size', equals: 0.5 }])] }),
      'constraints[0].when[0] combination',
    ],
    [
      'aralıklı boyutta sınırsız koşul',
      shellSpec({ constraints: [rule([{ dimension: 'size' }])] }),
      'constraints[0].when[0] combination',
    ],
  ])('%s', (_, doc, expected) => {
    expect(issue(() => validateSearchSpec(doc))).toBe(expected);
  });

  it('açıklama korunur; yalnız-min ve yalnız-max kuralları değerlendirilir', () => {
    const spec = validateSearchSpec(
      shellSpec({
        description: 'kenar',
        constraints: [
          rule([{ dimension: 'size', min: 0.7 }], 'büyük'),
          rule([{ dimension: 'hardness', max: 0.2 }], 'yumuşak'),
        ],
      }),
    );
    expect(spec.description).toBe('kenar');
    expect(excludedBy(spec, { size: 0.75, hardness: 0.5, layout: 'bar' })).toBe(0);
    expect(excludedBy(spec, { size: 0.5, hardness: 0.1, layout: 'bar' })).toBe(1);
    expect(excludedBy(spec, { size: 0.5, hardness: 0.5, layout: 'bar' })).toBeNull();
    expect(excludedBy(spec, { size: 'x', hardness: 0.5, layout: 'bar' })).toBeNull();
  });
});

describe('arama seçimi ve rapor belgeleri', () => {
  const decision = { state: 'approved', by: 'human', labels: [], note: null };
  it.each([
    ['geçersiz etiket', { ...decision, labels: ['Büyük'] }, 'd.labels[0] type'],
    [
      'dokuz etiket',
      { ...decision, labels: Array.from({ length: 9 }, (_, i) => `l${i}`) },
      'd.labels range',
    ],
    ['yinelenen etiket', { ...decision, labels: ['a', 'a'] }, 'd.labels combination'],
    ['uzun not', { ...decision, note: 'x'.repeat(1001) }, 'd.note type'],
  ])('karar: %s', (_, doc, expected) => {
    expect(issue(() => validateDecision(doc, 'd'))).toBe(expected);
  });

  it('seçim belgesi: şema, rapor özeti ve aday anahtarı denetlenir', () => {
    const ok = {
      schema: 'SearchSelectionV1',
      searchId: 's',
      reportHash: `sha256:${'0'.repeat(64)}`,
      decisions: {},
    };
    expect(validateSearchSelection(ok).decisions).toEqual({});
    expect(issue(() => validateSearchSelection({ ...ok, schema: 'X' }))).toBe('schema type');
    expect(issue(() => validateSearchSelection({ ...ok, reportHash: 'x' }))).toBe(
      'reportHash type',
    );
    expect(issue(() => validateSearchSelection({ ...ok, decisions: { nope: decision } }))).toBe(
      'decisions.nope type',
    );
  });

  it('rapor belgesi: şema, özet, kimlik ve render alanları denetlenir', () => {
    const candidate = {
      ordinal: 0,
      point: [0.1],
      values: {},
      candidateId: 'c-0123456789abcdef',
      programHash: `sha256:${'1'.repeat(64)}`,
      state: 'passed',
      rejection: null,
      cost: null,
      risks: [],
      render: { pcmHash: `sha256:${'2'.repeat(64)}`, sampleRate: 48000, channels: 1, frames: 1 },
      descriptors: null,
      checks: null,
    };
    const doc = {
      schema: 'AcousticSearchReportV1',
      searchId: 's',
      specHash: `sha256:${'3'.repeat(64)}`,
      base: {},
      strategy: {},
      seed: 1,
      dimensions: [],
      engine: {},
      preflight: {},
      candidates: [candidate],
      summary: {},
    };
    expect(validateSearchReport(doc).candidates).toHaveLength(1);
    expect(issue(() => validateSearchReport({ ...doc, schema: 'X' }))).toBe('schema type');
    expect(issue(() => validateSearchReport({ ...doc, specHash: 'x' }))).toBe('specHash type');
    expect(
      issue(() =>
        validateSearchReport({ ...doc, candidates: [{ ...candidate, candidateId: 'x' }] }),
      ),
    ).toBe('candidates[0].candidateId type');
    expect(
      issue(() =>
        validateSearchReport({ ...doc, candidates: [{ ...candidate, candidateId: null }] }),
      ),
    ).toBe('candidates[0].candidateId required');
    expect(
      issue(() =>
        validateSearchReport({
          ...doc,
          candidates: [{ ...candidate, render: { ...candidate.render, pcmHash: 'x' } }],
        }),
      ),
    ).toBe('candidates[0].render.pcmHash type');
  });

  it('render sırasında düşen aday `error` durumuyla ve hata yoluyla raporlanır', () => {
    const plan = planSearch(validateSearchSpec(programSpec({ candidates: 1 })));
    const broken = {
      ...plan,
      candidates: [{ ...plan.candidates[0], program: { schema: 'AcousticProgramV1' } as never }],
    };
    const [result] = executeSearch(broken);
    expect(result).toMatchObject({
      state: 'error',
      render: null,
      rejection: { stage: 'render', code: 'AudioParamError' },
    });
    expect(result.rejection?.path).not.toBeNull();
  });
});
