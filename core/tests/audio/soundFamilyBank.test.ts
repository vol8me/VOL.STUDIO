import { describe, expect, it } from 'vitest';
import { fnv1a32, SoundFamilyBank } from '../../src/audio/sfx/SoundFamilyBank';

/** Üretici bankının (SoundFamilyBankV1) tüketicinin okuduğu alt kümesi. */
function bankDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const variant = (key: string, intensity: string, tags: string[]) => ({
    key,
    variantId: `v-${key}`,
    roles: { intensity, weight: 'heavy' },
    tags,
    asset: {
      path: `public/assets/audio/sfx/families/hits/${key}.ogg`,
      bytes: 100,
      encodedHash: 'sha256:x',
    },
    manifest: { path: 'audio-manifests/x.json', hash: 'sha256:x' },
    programHash: 'sha256:x',
    pcmHash: 'sha256:x',
    durationSeconds: 0.8,
    loudness: { maxMomentaryLufs: -14, integratedLufs: null, truePeakDbtp: -2 },
    descriptors: { activeSeconds: 0.5, centroidHz: 900, pitchHz: null },
  });
  return {
    schema: 'SoundFamilyBankV1',
    lookupContract: 'sound-family-lookup-v1',
    package: '@volstudio/example',
    family: { familyId: 'hits', version: 1, hash: 'sha256:x', seed: 1, path: 'x' },
    ordering: 'key',
    choice: { method: 'fnv1a32-mod-v1' },
    roleAxes: { intensity: ['hard', 'soft'] },
    // Dizi konumu anlam taşımaz: okuyucu anahtara göre sıralar.
    variants: [
      variant('soft-b', 'soft', ['knock']),
      variant('hard-b', 'hard', ['strike']),
      variant('hard-a', 'hard', ['strike', 'rare']),
      variant('soft-a', 'soft', ['knock']),
    ],
    ...overrides,
  };
}

describe('SoundFamilyBank', () => {
  it('FNV-1a üretici sözleşmesinin vektörlerini verir (UTF-8 bayt)', () => {
    expect([fnv1a32(''), fnv1a32('a'), fnv1a32('foobar')]).toEqual([
      0x811c9dc5, 0xe40c292c, 0xbf9cf968,
    ]);
    // Çok baytlı karakter UTF-8 baytlarıyla (C5 9F) özetlenir, UTF-16 birimiyle değil.
    const overBytes = (bytes: number[]): number =>
      bytes.reduce((hash, byte) => Math.imul(hash ^ byte, 0x01000193) >>> 0, 0x811c9dc5);
    expect(fnv1a32('\u015f')).toBe(overBytes([0xc5, 0x9f]));
    expect(fnv1a32('\u015f')).not.toBe(overBytes([0x5f, 0x01]));
  });

  it('anahtarla bulur; süzme rol ve etiketi birlikte ister, anahtara göre sıralıdır', () => {
    const bank = SoundFamilyBank.parse(bankDocument());
    expect(bank.familyId).toBe('hits');
    expect(bank.variant('hard-a')?.path).toBe('public/assets/audio/sfx/families/hits/hard-a.ogg');
    expect(bank.variant('missing')).toBeUndefined();
    expect(bank.filter({ roles: { intensity: 'hard' } }).map((v) => v.key)).toEqual([
      'hard-a',
      'hard-b',
    ]);
    expect(bank.filter({ roles: { intensity: 'hard' }, tags: ['rare'] }).map((v) => v.key)).toEqual(
      ['hard-a'],
    );
    expect(bank.filter().map((v) => v.key)).toEqual(['hard-a', 'hard-b', 'soft-a', 'soft-b']);
  });

  it('seçim deterministiktir: FNV-1a(token) mod süzülmüş liste', () => {
    const bank = SoundFamilyBank.parse(bankDocument());
    const soft = bank.filter({ roles: { intensity: 'soft' } });
    for (const token of ['impact:1', 'impact:2', 'x', '']) {
      const chosen = bank.choose(token, { roles: { intensity: 'soft' } });
      expect(chosen).toBe(soft[fnv1a32(token) % soft.length]);
      expect(bank.choose(token, { roles: { intensity: 'soft' } })).toBe(chosen);
    }
    expect(bank.choose('x', { tags: ['nope'] })).toBeUndefined();
  });

  it.each([
    ['şema', { schema: 'SoundFamilyBankV2' }],
    ['sözleşme sürümü', { lookupContract: 'sound-family-lookup-v2' }],
    ['seçim yöntemi', { choice: { method: 'random' } }],
    ['boş varyant', { variants: [] }],
    ['mutlak yol', { variants: [{ ...variantOf(), asset: { path: '/etc/x.ogg' } }] }],
    ['üst dizin', { variants: [{ ...variantOf(), asset: { path: 'a/../b.ogg' } }] }],
    ['süre', { variants: [{ ...variantOf(), durationSeconds: 0 }] }],
    ['yinelenen anahtar', { variants: [variantOf(), variantOf()] }],
  ])('bozuk bank açılışta reddedilir: %s', (_name, overrides) => {
    expect(() => SoundFamilyBank.parse(bankDocument(overrides))).toThrow(/SoundFamilyBank/);
  });

  it('nesne olmayan belge reddedilir', () => {
    expect(() => SoundFamilyBank.parse(null)).toThrow(/SoundFamilyBank/);
    expect(() => SoundFamilyBank.parse([])).toThrow(/SoundFamilyBank/);
  });
});

function variantOf(): Record<string, unknown> {
  return {
    key: 'only',
    roles: {},
    tags: [],
    asset: { path: 'public/assets/audio/sfx/only.ogg' },
    durationSeconds: 1,
  };
}
