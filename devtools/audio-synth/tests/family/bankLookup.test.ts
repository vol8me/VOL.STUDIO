import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Çalışma zamanı tüketicisinin gözünden bank: bu dosya audio-synth'in HİÇBİR
 * modülünü import etmez (kendi kaynağını okuyup bunu da sınar). Yalnız bank
 * JSON'u, asset baytları ve sözleşmedeki arama kuralı kullanılır.
 */
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const BANK_FILE = join(PACKAGE, 'reference/production/banks/reference-shell-hits.json');

interface Variant {
  key: string;
  roles: Record<string, string>;
  tags: string[];
  asset: { path: string; encodedHash: string; bytes: number };
}
interface Bank {
  schema: string;
  lookupContract: string;
  choice: { method: string };
  variants: Variant[];
}

const bank = JSON.parse(readFileSync(BANK_FILE, 'utf8')) as Bank;

function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h >>> 0;
}

function filter(
  variants: Variant[],
  roles: Record<string, string> = {},
  tags: string[] = [],
): Variant[] {
  return variants
    .filter(
      (v) =>
        Object.entries(roles).every(([axis, value]) => v.roles[axis] === value) &&
        tags.every((t) => v.tags.includes(t)),
    )
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const choose = (variants: Variant[], roles: Record<string, string>, token: string) => {
  const list = filter(variants, roles);
  return list.length ? list[fnv1a32(token) % list.length].key : null;
};

describe('SoundFamilyBankV1 — yalnız manifest ile çalışma zamanı araması', () => {
  it('bu test audio-synth kodu import etmez', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const imports = [...self.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.filter((i) => i.includes('/src') || i.includes('audio-synth'))).toEqual([]);
  });

  it('sözleşme sürümü ve seçim yöntemi beyanlı', () => {
    expect(bank).toMatchObject({
      schema: 'SoundFamilyBankV1',
      lookupContract: 'sound-family-lookup-v1',
      choice: { method: 'fnv1a32-mod-v1' },
    });
    expect(bank.variants.length).toBeGreaterThanOrEqual(8);
  });

  it('tam anahtar araması asset’e ulaşır; baytlar bank özetiyle aynı', () => {
    for (const v of bank.variants) {
      const file = join(PACKAGE, v.asset.path);
      expect(existsSync(file), v.key).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.length).toBe(v.asset.bytes);
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(
        v.asset.encodedHash,
      );
    }
    expect(new Set(bank.variants.map((v) => v.key)).size).toBe(bank.variants.length);
  });

  it('rol ve etiket süzmesi anahtara göre sıralı sonuç verir', () => {
    expect(filter(bank.variants, { intensity: 'hard' }).map((v) => v.key)).toEqual([
      'hard-heavy',
      'hard-heavy-alt',
      'hard-light',
    ]);
    expect(
      filter(bank.variants, { intensity: 'hard', rarity: 'common' }).map((v) => v.key),
    ).toEqual(['hard-heavy', 'hard-light']);
    expect(filter(bank.variants, {}, ['tap']).map((v) => v.key)).toEqual([
      'soft-heavy',
      'soft-light',
    ]);
    expect(filter(bank.variants, { weight: 'medium' })).toEqual([]);
  });

  it('deterministik seçim: FNV-1a test vektörleri, dizi sırasından bağımsız', () => {
    expect([fnv1a32(''), fnv1a32('a'), fnv1a32('foobar')]).toEqual([
      0x811c9dc5, 0xe40c292c, 0xbf9cf968,
    ]);
    const tokens = ['impact:1', 'impact:2', 'impact:3', 'crate-7', 'ğüşiöç'];
    const picks = tokens.map((t) => choose(bank.variants, { rarity: 'common' }, t));
    expect(
      tokens.map((t) => choose([...bank.variants].reverse(), { rarity: 'common' }, t)),
    ).toEqual(picks);
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(choose(bank.variants, { weight: 'medium' }, 'x')).toBeNull();
  });
});
