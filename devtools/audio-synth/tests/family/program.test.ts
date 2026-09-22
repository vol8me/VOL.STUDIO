import { describe, expect, it } from 'vitest';
import {
  expandFamily,
  validateFamilyProgram,
  type ExpandedVariant,
} from '../../src/family/program';
import { AudioParamError } from '../../src/guard/errors';
import { renderProgram } from '../../src/program/render';
import { hashPcm } from '../../src/protocol/canonical';
import { edited, getAt } from '../support/json';
import { dropletFamily, shellFamily } from './fixtures';

const expand = (doc: unknown) => expandFamily(validateFamilyProgram(doc));
const byKey = (variants: readonly ExpandedVariant[]) => new Map(variants.map((v) => [v.key, v]));
const pcm = (v: ExpandedVariant) => {
  const r = renderProgram(v.program);
  return hashPcm(r.channels, r.sampleRate);
};

function issueOf(doc: unknown): { path: string; issue: string } {
  try {
    expand(doc);
  } catch (error) {
    if (error instanceof AudioParamError) return { path: error.path, issue: error.issue };
    throw error;
  }
  throw new Error('reddedilmedi');
}

describe('SoundFamilyProgramV1 genişletmesi', () => {
  it.each([
    ['kabuk (archetype tabanı)', shellFamily()],
    ['damla (program tabanı)', dropletFamily()],
  ])('%s: sekiz deterministik varyant, tekil program ve PCM', (_, doc) => {
    const a = expand(doc);
    expect(a).toHaveLength(8);
    expect(expand(doc)).toEqual(a);
    expect(new Set(a.map((v) => v.programHash)).size).toBe(8);
    expect(new Set(a.map(pcm)).size).toBe(8);
    for (const v of a) expect(v.variantId).toMatch(/^v-[0-9a-f]{16}$/);
  });

  it('varyasyon anlamsal boyutlardan gelir: tohum/perde/kazanç ezmesi değil', () => {
    const variants = expand(shellFamily());
    expect(new Set(variants.map((v) => v.program.seed)).size).toBe(1);
    expect(new Set(variants.map((v) => JSON.stringify(v.program.master))).size).toBe(1);
    for (const name of ['size', 'hardness', 'damping']) {
      expect(new Set(variants.map((v) => v.values[name])).size, name).toBe(8);
    }
    const layouts = variants.map((v) =>
      getAt(v.program, ['layers', 0, 'resonators', 0, 'params', 'layout']),
    );
    expect(new Set(layouts)).toEqual(new Set(['bar', 'membrane']));
  });

  it('rol, boyutun alt aralığını seçer; role bağlı boyut yalnız o role uygulanır', () => {
    const variants = byKey(expand(shellFamily()));
    for (const v of variants.values()) {
      const hardness = v.values.hardness as number;
      if (v.roles.intensity === 'soft') expect(hardness >= 0.3 && hardness <= 0.45).toBe(true);
      else expect(hardness >= 0.75 && hardness <= 0.95).toBe(true);
      expect(v.values.layout).toBe(v.roles.rarity === 'alternate' ? 'membrane' : 'bar');
    }
    const noRarity = edited(shellFamily(), [
      ['variants', 0, 'roles'],
      { intensity: 'soft', weight: 'light' },
    ]);
    expect(byKey(expand(noRarity)).get('soft-light')?.values).not.toHaveProperty('layout');
  });

  it('dizi sırası rastgeleliği belirlemez; aile tohumu belirler', () => {
    const base = byKey(expand(shellFamily()));
    const doc = shellFamily();
    const reversed = byKey(
      expand({ ...doc, variants: [...(doc.variants as unknown[])].reverse() }),
    );
    for (const [key, v] of base) expect(reversed.get(key)).toEqual(v);
    const reseeded = byKey(expand(shellFamily({ seed: 12 })));
    expect(reseeded.get('soft-light')?.values).not.toEqual(base.get('soft-light')?.values);
  });

  it('bağımsız yeni alt sistem eski varyantları kaydırmaz: yeni rol + role bağlı boyut + yeni varyant', () => {
    const base = expand(shellFamily());
    const doc = shellFamily();
    const grown = byKey(
      expand({
        ...doc,
        dimensions: [
          {
            name: 'brightness',
            target: {
              kind: 'node-param',
              layer: 'strike',
              slot: 'resonator',
              index: 0,
              primitive: 'resonator.modal',
              param: 'brightness',
            },
            range: { min: 0.1, max: 0.9, scale: 'linear', unit: 'normalized' },
            scope: 'role',
          },
          ...(doc.dimensions as unknown[]),
        ],
        roles: {
          ...(doc.roles as object),
          onset: { sharp: { brightness: { min: 0.7, max: 0.9 } } },
        },
        variants: [
          { key: 'aa-new', roles: { intensity: 'hard', onset: 'sharp' } },
          ...(doc.variants as unknown[]),
        ],
      }),
    );
    expect(grown.size).toBe(9);
    for (const old of base) {
      const now = grown.get(old.key);
      expect(now?.programHash, old.key).toBe(old.programHash);
      expect(now?.variantId, old.key).toBe(old.variantId);
    }
    expect(pcm(grown.get('hard-light') as ExpandedVariant)).toBe(
      pcm(base.find((v) => v.key === 'hard-light') as ExpandedVariant),
    );
    expect(grown.get('aa-new')?.values).toHaveProperty('brightness');
  });

  it.each([
    [
      'oyun alanı rol ekseni şemada yok',
      edited(shellFamily(), [['roles', 'enemyType'], { boss: {} }]),
      'roles.enemyType',
      'unknown-key',
    ],
    [
      'eksen dışı rol değeri',
      edited(shellFamily(), [['roles', 'intensity', 'bossPhase'], {}]),
      'roles.intensity.bossPhase',
      'unknown-key',
    ],
    [
      'bilinmeyen boyuta rol kısıtı',
      edited(shellFamily(), [['roles', 'weight', 'light'], { gain: { min: 0, max: 1 } }]),
      'roles.weight.light.gain',
      'unknown-key',
    ],
    [
      'rol alt aralığı boyut dışı',
      edited(shellFamily(), [['roles', 'weight', 'light', 'size'], { min: 0, max: 0.4 }]),
      'roles.weight.light.size.min',
      'range',
    ],
    [
      'kullanılmayan rol değeri (kapsam)',
      edited(shellFamily(), [
        ['roles', 'intensity', 'medium'],
        { hardness: { min: 0.5, max: 0.7 } },
      ]),
      'roles.intensity.medium',
      'combination',
    ],
    [
      'yinelenen anahtar',
      edited(shellFamily(), [['variants', 1, 'key'], 'soft-light']),
      'variants[1].key',
      'combination',
    ],
    [
      'tanımsız eksen ataması',
      edited(shellFamily(), [['variants', 0, 'roles', 'speed'], 'fast']),
      'variants[0].roles.speed',
      'unknown-key',
    ],
    [
      'teslim süresi dışı',
      edited(shellFamily(), [['delivery', 'durationSeconds'], { min: 0.6, max: 1 }]),
      'variants.hard-heavy',
      'range',
    ],
    [
      'teslim yolu kaçışı',
      edited(shellFamily(), [['delivery', 'assetDir'], 'reference/../../x']),
      'delivery.assetDir',
      'type',
    ],
  ])('%s → adlı hata', (_, doc, path, issue) => {
    expect(issueOf(doc)).toEqual({ path, issue });
  });

  it('kesişmeyen rol kısıtları varyantı render ÖNCESİ reddeder', () => {
    const doc = edited(shellFamily(), [
      ['roles', 'rarity', 'alternate'],
      { layout: { options: ['membrane'] }, size: { min: 0.8, max: 0.85 } },
    ]);
    expect(issueOf(doc)).toEqual({ path: 'variants.hard-light-alt', issue: 'combination' });
  });
});
