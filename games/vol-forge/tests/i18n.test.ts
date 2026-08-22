import { describe, it, expect } from 'vitest';
import { FIELD_KINDS, NODE_SCHEMAS } from '@volstudio/core/visual';
import tr from '../src/i18n/tr.json';
import en from '../src/i18n/en.json';
import trParams from '../src/i18n/params.tr.json';
import enParams from '../src/i18n/params.en.json';

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

  it('şema metinleri de parite içinde', () => {
    expect(flatten(enParams).sort()).toEqual(flatten(trParams).sort());
  });

  it('hiçbir metin BOŞ değil — eksik çeviri sessiz kalmasın', () => {
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
    walk(trParams, '', 'params.tr');
    walk(enParams, '', 'params.en');
    expect(empties).toEqual([]);
  });
});

describe('şema i18n"i ÜRETİLİR — şemayla ayrışamaz (§8.13)', () => {
  const key = (kind: string): string => kind.replace(/\./g, '_');

  it('her düğüm türü için açıklama vardır', () => {
    const missing = FIELD_KINDS.filter((kind) => !(key(kind) in trParams));
    expect(missing).toEqual([]);
  });

  it('her parametre için etiket vardır', () => {
    const missing: string[] = [];
    for (const kind of FIELD_KINDS) {
      const entry = (trParams as Record<string, { params: Record<string, string> }>)[key(kind)];
      for (const param of NODE_SCHEMAS[kind].params) {
        if (!(param.name in entry.params)) missing.push(`${kind}.${param.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('fazladan anahtar YOKTUR — silinen bir primitif metni geride bırakmaz', () => {
    const known = new Set(FIELD_KINDS.map(key));
    expect(Object.keys(trParams).filter((entry) => !known.has(entry))).toEqual([]);
  });

  it('tür adındaki nokta ALT ÇİZGİYE çevrilir', () => {
    // i18next `.` karakterini iç içe geçme ayracı olarak kullanır.
    expect('sdf_circle' in trParams).toBe(true);
    expect('sdf.circle' in trParams).toBe(false);
  });
});
