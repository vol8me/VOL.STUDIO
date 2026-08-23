import { describe, it, expect } from 'vitest';
import studioTr from '../../src/i18n/tr.json';
import studioEn from '../../src/i18n/en.json';
import { API_ERROR_CODES, PROBLEM_CODES } from '../../shared/contracts.js';

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

function emptyValues(obj: Record<string, unknown>, prefix = ''): string[] {
  const empties: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      empties.push(...emptyValues(value as Record<string, unknown>, fullKey));
    } else if (typeof value === 'string' && value.trim() === '') {
      empties.push(fullKey);
    }
  }
  return empties;
}

describe('Key parity — vol-asset-studio', () => {
  it('tr.json ve en.json aynı key yapısına sahip', () => {
    const trKeys = extractKeys(studioTr as Record<string, unknown>);
    const enKeys = extractKeys(studioEn as Record<string, unknown>);
    expect(enKeys).toEqual(trKeys);
    expect(trKeys.length).toBeGreaterThan(0);
  });

  it('hiçbir çeviri değeri boş olmamalı', () => {
    const trEmpties = emptyValues(studioTr as Record<string, unknown>);
    const enEmpties = emptyValues(studioEn as Record<string, unknown>);
    expect(trEmpties, `Boş tr değerleri: ${trEmpties.join(', ')}`).toEqual([]);
    expect(enEmpties, `Boş en değerleri: ${enEmpties.join(', ')}`).toEqual([]);
  });

  it('her API hata kodunun iki dilde de karşılığı var', () => {
    // Sunucu kullanıcıya metin göndermez, kod gönderir. Karşılığı
    // olmayan bir kod kullanıcıya çiğ `asset_conflict` gibi bir dize gösterirdi.
    for (const locale of [studioTr, studioEn] as Record<string, unknown>[]) {
      const errors = locale.errors as Record<string, unknown> | undefined;
      const missing = API_ERROR_CODES.filter((code) => typeof errors?.[code] !== 'string');
      expect(missing, `Çevirisi olmayan hata kodları: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('her katalog sorun kodunun iki dilde de karşılığı var', () => {
    for (const locale of [studioTr, studioEn] as Record<string, unknown>[]) {
      const problems = locale.problems as Record<string, unknown> | undefined;
      const missing = PROBLEM_CODES.filter((code) => typeof problems?.[code] !== 'string');
      expect(missing, `Çevirisi olmayan sorun kodları: ${missing.join(', ')}`).toEqual([]);
    }
  });
});
