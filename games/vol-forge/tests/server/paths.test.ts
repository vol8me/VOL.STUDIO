import { describe, it, expect } from 'vitest';
import { PRESET_CATEGORIES } from '@volstudio/core/visual';
import { NAME_PATTERN, isInsideOutput, resolveTarget } from '../../server/paths';

describe('çıktı yolu güvenliği (§8.11)', () => {
  it('sabit listedeki kategoriler kabul edilir', () => {
    for (const category of PRESET_CATEGORIES) {
      const result = resolveTarget(category, 'ornek', PRESET_CATEGORIES);
      expect(result.ok, category).toBe(true);
    }
  });

  it('liste dışı kategori reddedilir', () => {
    expect(resolveTarget('metaller', 'a', PRESET_CATEGORIES)).toMatchObject({ ok: false });
    expect(resolveTarget('', 'a', PRESET_CATEGORIES)).toMatchObject({ ok: false });
    expect(resolveTarget(null, 'a', PRESET_CATEGORIES)).toMatchObject({ ok: false });
  });

  it('ad kalıbı üst klasöre çıkmayı kapatır', () => {
    for (const name of ['..', '../gizli', 'a/b', 'a\\b', 'BÜYÜK', 'nokta.li', '']) {
      expect(resolveTarget('material', name, PRESET_CATEGORIES), name).toMatchObject({ ok: false });
    }
  });

  it('geçerli ad iki dosya yolu üretir', () => {
    const result = resolveTarget('organic', 'bark-a', PRESET_CATEGORIES);
    expect(result).toEqual({
      ok: true,
      target: {
        directory: 'organic',
        name: 'bark-a',
        docPath: 'organic/bark-a.json',
        pngPath: 'organic/bark-a.png',
      },
    });
  });

  it('ad 64 karakteri aşamaz', () => {
    expect(NAME_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(NAME_PATTERN.test('a'.repeat(65))).toBe(false);
  });

  it('sınır kontrolü kalıptan BAĞIMSIZ olarak da tutar', () => {
    // İkinci kapı: kalıp bir gün gevşerse bu kontrol yine durur.
    expect(isInsideOutput('material/a.png')).toBe(true);
    expect(isInsideOutput('../a.png')).toBe(false);
    expect(isInsideOutput('/etc/passwd')).toBe(false);
    expect(isInsideOutput('a\\b')).toBe(false);
    expect(isInsideOutput('a//b')).toBe(false);
    expect(isInsideOutput('./a')).toBe(false);
    expect(isInsideOutput('')).toBe(false);
  });
});

describe('çıktı listeleme', () => {
  it('boş klasörde boş sonuç verir, patlamaz', async () => {
    const { listOutputs } = await import('../../server/forgePlugin');
    expect(listOutputs(PRESET_CATEGORIES, '/var/empty-forge-output-does-not-exist')).toEqual({});
  });
});
