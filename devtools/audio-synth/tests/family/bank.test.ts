import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chooseVariant, fnv1a32, validateBank } from '../../src/family/bank';
import { AudioParamError } from '../../src/guard/errors';
import { verifyFamily } from '../../src/protocol/family';
import { edited } from '../support/json';

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const BANK = join(
  REPO,
  'devtools/audio-synth/reference/production/banks/reference-shell-hits.json',
);
const doc = JSON.parse(readFileSync(BANK, 'utf8')) as unknown;

describe('SoundFamilyBankV1 şeması ve referans bank', () => {
  it('referans aile TAMAM: bank, aile, kalite ve bütün varyant bağları doğrulanır', () => {
    const report = verifyFamily({
      repoRoot: REPO,
      familiesRoot: 'devtools/audio-synth/audio-families',
      familyId: 'reference-shell-hits',
    });
    expect(report.checks.filter((c) => !c.ok)).toEqual([]);
    expect(report.complete).toBe(true);
    const bank = validateBank(doc);
    expect(bank.variants).toHaveLength(8);
    expect(new Set(bank.variants.map((v) => v.pcmHash)).size).toBe(8);
    expect(new Set(bank.variants.map((v) => v.variantId)).size).toBe(8);
  });

  it.each([
    [
      'sırasız varyantlar',
      (d: unknown) =>
        edited(d, [['variants'], [...(validateBank(d).variants as unknown[])].reverse()]),
    ],
    ['geçmeyen kalite', (d: unknown) => edited(d, [['quality', 'pass'], false])],
    ['bilinmeyen alan', (d: unknown) => edited(d, [['enemyType'], 'boss'])],
    [
      'mutlak asset yolu',
      (d: unknown) => edited(d, [['variants', 0, 'asset', 'path'], '/etc/passwd']),
    ],
    [
      'kaçan manifest yolu',
      (d: unknown) => edited(d, [['variants', 0, 'manifest', 'path'], '../x.json']),
    ],
    ['sözleşme sürümü', (d: unknown) => edited(d, [['lookupContract'], 'sound-family-lookup-v2'])],
  ])('%s reddedilir', (_, mutate) => {
    expect(() => validateBank(mutate(doc))).toThrow(AudioParamError);
  });

  it('referans uygulama sözleşmeyle aynı: FNV-1a vektörleri ve süzülmüş liste üzerinde mod', () => {
    expect([fnv1a32(''), fnv1a32('a'), fnv1a32('foobar')]).toEqual([
      0x811c9dc5, 0xe40c292c, 0xbf9cf968,
    ]);
    const bank = validateBank(doc);
    const hard = chooseVariant(bank, { roles: { intensity: 'hard' } }, 'impact:1');
    expect(['hard-heavy', 'hard-heavy-alt', 'hard-light']).toContain(hard?.key);
    expect(chooseVariant(bank, { tags: ['nope'] }, 'x')).toBeNull();
  });
});
