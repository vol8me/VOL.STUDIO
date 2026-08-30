import { describe, expect, it } from 'vitest';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

function extractKeys(value: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      keys.push(...extractKeys(child as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('Key parity — vol-arachnid', () => {
  it('Türkçe ve İngilizce aynı key yapısını taşır', () => {
    expect(extractKeys(en as Record<string, unknown>)).toEqual(
      extractKeys(tr as Record<string, unknown>),
    );
  });

  it('boş bir i18n yüzeyi bırakmaz', () => {
    expect(extractKeys(tr as Record<string, unknown>).length).toBeGreaterThan(0);
  });
});
