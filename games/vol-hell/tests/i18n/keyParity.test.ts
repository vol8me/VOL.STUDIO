import { describe, it, expect } from 'vitest';
import volhellTr from '../../src/i18n/tr.json';
import volhellEn from '../../src/i18n/en.json';

/** İç içe nesneden tüm leaf key'leri nokta notasyonunda çıkarır. */
function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('Key parity — vol-hell', () => {
  it('tr.json ve en.json aynı key yapısına sahip', () => {
    const trKeys = extractKeys(volhellTr as Record<string, unknown>);
    const enKeys = extractKeys(volhellEn as Record<string, unknown>);
    expect(enKeys).toEqual(trKeys);
  });

  it('boş olmayan key kalmamalı', () => {
    const trKeys = extractKeys(volhellTr as Record<string, unknown>);
    expect(trKeys.length).toBeGreaterThan(0);
  });
});
