import { describe, it, expect } from 'vitest';
import coreTr from '../../src/i18n/tr.json';
import coreEn from '../../src/i18n/en.json';
import voluiTr from '../../../games/vol-ui/src/i18n/tr.json';
import voluiEn from '../../../games/vol-ui/src/i18n/en.json';

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

describe('Key parity — core', () => {
  it('tr.json ve en.json aynı key yapısına sahip', () => {
    const trKeys = extractKeys(coreTr as Record<string, unknown>);
    const enKeys = extractKeys(coreEn as Record<string, unknown>);
    expect(enKeys).toEqual(trKeys);
  });

  it('boş olmayan key kalmamalı', () => {
    const trKeys = extractKeys(coreTr as Record<string, unknown>);
    expect(trKeys.length).toBeGreaterThan(0);
  });
});

describe('Key parity — vol-ui', () => {
  it('tr.json ve en.json aynı key yapısına sahip', () => {
    const trKeys = extractKeys(voluiTr as Record<string, unknown>);
    const enKeys = extractKeys(voluiEn as Record<string, unknown>);
    expect(enKeys).toEqual(trKeys);
  });
});
