import { describe, it, expect } from 'vitest';
import voluiTr from '../../src/i18n/tr.json';
import voluiEn from '../../src/i18n/en.json';

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

describe('Key parity — vol-ui', () => {
  it('tr.json ve en.json aynı key yapısına sahip', () => {
    const trKeys = extractKeys(voluiTr as Record<string, unknown>);
    const enKeys = extractKeys(voluiEn as Record<string, unknown>);
    expect(enKeys).toEqual(trKeys);
  });

  it('boş olmayan key kalmamalı', () => {
    const trKeys = extractKeys(voluiTr as Record<string, unknown>);
    expect(trKeys.length).toBeGreaterThan(0);
  });

  it('hiçbir çeviri değeri boş string olmamalı', () => {
    function checkEmpty(obj: Record<string, unknown>, prefix = ''): string[] {
      const empties: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          empties.push(...checkEmpty(value as Record<string, unknown>, fullKey));
        } else if (typeof value === 'string' && value === '') {
          empties.push(fullKey);
        }
      }
      return empties;
    }

    const trEmpties = checkEmpty(voluiTr as Record<string, unknown>);
    const enEmpties = checkEmpty(voluiEn as Record<string, unknown>);
    expect(trEmpties, `Boş tr değerleri: ${trEmpties.join(', ')}`).toEqual([]);
    expect(enEmpties, `Boş en değerleri: ${enEmpties.join(', ')}`).toEqual([]);
  });
});
