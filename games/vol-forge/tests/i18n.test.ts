import { describe, expect, it } from 'vitest';
import tr from '../src/i18n/tr.json';
import en from '../src/i18n/en.json';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n paritesi (Bozulamaz Kural 1)', () => {
  it('tr ve en aynı anahtarları taşır', () => {
    expect(flatten(en).sort()).toEqual(flatten(tr).sort());
  });

  it('kullanıcıya gösterilen hiçbir çeviri boş değildir', () => {
    const empties: string[] = [];
    const walk = (value: unknown, prefix: string, bucket: string): void => {
      if (typeof value === 'string') {
        if (value.trim().length === 0) empties.push(`${bucket}:${prefix}`);
        return;
      }
      if (typeof value !== 'object' || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        walk(child, prefix ? `${prefix}.${key}` : key, bucket);
      }
    };
    walk(tr, '', 'tr');
    walk(en, '', 'en');
    expect(empties).toEqual([]);
  });
});
