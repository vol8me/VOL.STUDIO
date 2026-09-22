import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { hashCanonical } from '../../src/protocol/canonical';
import { planSearch } from '../../src/search/plan';
import { validateSearchSpec } from '../../src/search/spec';
import { edited } from '../support/json';
import { programSpec, reverseKeys, shellSpec } from './fixtures';

function issueOf(spec: unknown): { path: string; issue: string } {
  try {
    validateSearchSpec(spec);
  } catch (error) {
    if (error instanceof AudioParamError) return { path: error.path, issue: error.issue };
    throw error;
  }
  throw new Error('spec reddedilmedi');
}

describe('AcousticSearchSpecV1 doğrulaması', () => {
  it('geçerli spec normalize edilir: boyutlar ada göre sıralanır', () => {
    expect(validateSearchSpec(shellSpec()).dimensions.map((d) => d.name)).toEqual([
      'hardness',
      'layout',
      'size',
    ]);
  });

  it('JSON anahtar sırası ve boyut dizisi sırası spec özetini ve planı değiştirmez', () => {
    const a = validateSearchSpec(shellSpec());
    const shuffled = reverseKeys(shellSpec()) as Record<string, unknown>;
    const b = validateSearchSpec({
      ...shuffled,
      dimensions: [...(shuffled.dimensions as unknown[])].reverse(),
    });
    expect(hashCanonical(b)).toBe(hashCanonical(a));
    const ids = (s: typeof a) =>
      planSearch(s).candidates.map((c) => [c.candidateId, c.programHash]);
    expect(ids(b)).toEqual(ids(a));
  });

  it.each([
    ['bilinmeyen alan', edited(shellSpec(), [['extra'], 1]), 'extra', 'unknown-key'],
    [
      'birim registry ile uyuşmaz',
      edited(programSpec(), [['dimensions', 0, 'range', 'unit'], 'normalized']),
      'dimensions[0].range.unit',
      'combination',
    ],
    [
      'aralık registry sınırı dışında',
      edited(programSpec(), [['dimensions', 0, 'range', 'max'], 99999]),
      'dimensions[0].range.max',
      'range',
    ],
    [
      'log ölçekte min ≤ 0',
      edited(
        shellSpec(),
        [['dimensions', 0, 'range', 'scale'], 'log'],
        [['dimensions', 0, 'range', 'min'], 0],
      ),
      'dimensions[0].range.min',
      'range',
    ],
    [
      'seçenek registry’de yok',
      edited(shellSpec(), [
        ['dimensions', 2, 'options'],
        ['bar', 'plate'],
      ]),
      'dimensions[2].options[1]',
      'type',
    ],
    [
      'yinelenen boyut adı',
      edited(shellSpec(), [['dimensions', 1, 'name'], 'size']),
      'dimensions[1].name',
      'combination',
    ],
    [
      'archetype makrosu control ile aranamaz',
      edited(shellSpec(), [
        ['dimensions', 0, 'target'],
        { kind: 'control', control: 'control.body-size' },
      ]),
      'dimensions[0].target.control',
      'combination',
    ],
    [
      'hedefi olmayan makro',
      edited(shellSpec(), [
        ['dimensions', 0, 'target'],
        { kind: 'control', control: 'control.pressure' },
      ]),
      'dimensions[0].target',
      'combination',
    ],
    [
      'düğüm adresi eşleşmez',
      edited(shellSpec(), [['dimensions', 2, 'target', 'primitive'], 'resonator.cavity']),
      'dimensions[2].target',
      'combination',
    ],
    [
      'archetype-param program tabanında',
      edited(programSpec(), [
        ['dimensions', 1, 'target'],
        { kind: 'archetype-param', param: 'size' },
      ]),
      'dimensions[1].target',
      'combination',
    ],
    [
      'strateji sürümü',
      edited(shellSpec(), [['strategy', 'version'], 2]),
      'strategy.version',
      'version',
    ],
    ['aday sayısı sınırı', edited(shellSpec(), [['candidates'], 1000]), 'candidates', 'range'],
    [
      'dışlama kuralında bilinmeyen boyut',
      shellSpec({
        constraints: [{ kind: 'exclude', when: [{ dimension: 'nope', max: 1 }], reason: 'x' }],
      }),
      'constraints[0].when[0].dimension',
      'unknown-id',
    ],
  ])('%s → adlı hata', (_, spec, path, issue) => {
    expect(issueOf(spec)).toEqual({ path, issue });
  });

  it('gesture’a bağlı parametre boyut olamaz (eğriyi silerdi)', () => {
    const spec = edited(
      programSpec(),
      [
        ['base', 'program', 'gestures'],
        {
          f: {
            curve: 'curve.linear',
            version: 1,
            points: [
              [0, 200],
              [0.3, 400],
            ],
          },
        },
      ],
      [['base', 'program', 'layers', 0, 'resonators', 0, 'params', 'frequency'], { gesture: 'f' }],
    );
    expect(issueOf(spec)).toEqual({ path: 'dimensions[0].target', issue: 'combination' });
  });
});
