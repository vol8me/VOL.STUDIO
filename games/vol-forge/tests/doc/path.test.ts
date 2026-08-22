import { describe, it, expect } from 'vitest';
import { getAt, parsePath, pathFromIssue, removeAt, samePath, setAt } from '../../src/doc/path';

const DOC = {
  size: [64, 32],
  layers: [
    { id: 'a', source: { kind: 'min', a: { kind: 'const', value: 1 } } },
    { id: 'b', source: { kind: 'const', value: 0.5 } },
  ],
};

describe('yol okuma ve yazma', () => {
  it('iç içe değeri okur', () => {
    expect(getAt(DOC, ['layers', 0, 'source', 'a', 'value'])).toBe(1);
    expect(getAt(DOC, ['size', 1])).toBe(32);
  });

  it('kırık yolda undefined döner, patlamaz', () => {
    expect(getAt(DOC, ['layers', 9, 'source'])).toBeUndefined();
    expect(getAt(DOC, ['layers', 0, 'yok', 'daha', 'derin'])).toBeUndefined();
  });

  it('yazma KAYNAĞI DEĞİŞTİRMEZ', () => {
    const next = setAt(DOC, ['layers', 1, 'source', 'value'], 0.9);
    expect(getAt(next, ['layers', 1, 'source', 'value'])).toBe(0.9);
    expect(getAt(DOC, ['layers', 1, 'source', 'value'])).toBe(0.5);
  });

  it('yol dışındaki kardeşler PAYLAŞILIR — anlık görüntü ucuz kalır', () => {
    const next = setAt(DOC, ['layers', 1, 'source', 'value'], 0.9);
    expect(next.layers[0]).toBe(DOC.layers[0]);
    expect(next.size).toBe(DOC.size);
  });

  it('dizi indeksine yazar', () => {
    const next = setAt(DOC, ['size', 0], 128);
    expect(next.size).toEqual([128, 32]);
  });

  it('boş yol kökü değiştirir', () => {
    expect(setAt(DOC, [], { size: [8, 8] })).toEqual({ size: [8, 8] });
  });

  it('çözümlenemeyen yol sessizce geçmez', () => {
    expect(() => setAt(DOC, ['layers', 0, 'id', 'derin'], 1)).toThrow(/Yol çözümlenemedi/);
  });
});

describe('anahtar kaldırma', () => {
  it('nesne anahtarını TAMAMEN siler', () => {
    const withMask = setAt(DOC, ['layers', 0, 'mask'], { kind: 'const', value: 1 });
    const removed = removeAt(withMask, ['layers', 0, 'mask']);
    expect('mask' in (removed.layers[0] as Record<string, unknown>)).toBe(false);
  });

  it('dizi elemanını çıkarır', () => {
    const removed = removeAt(DOC, ['layers', 0]);
    expect(removed.layers).toHaveLength(1);
    expect(removed.layers[0].id).toBe('b');
  });

  it('kök kaldırılamaz', () => {
    expect(() => removeAt(DOC, [])).toThrow(/Kökün kendisi/);
  });
});

describe('doğrulayıcı yolundan seçime', () => {
  it('dizgi yolu yapısal yola çevirir', () => {
    expect(parsePath('layers[0].source.freq')).toEqual(['layers', 0, 'source', 'freq']);
    expect(parsePath('palette.ramps[2].indices[1]')).toEqual(['palette', 'ramps', 2, 'indices', 1]);
  });

  it('sayıya benzeyen ADI indekse çevirmez', () => {
    // Ayrım köşeli parantezden gelir; `ramps.0` ile `ramps[0]` aynı şey değil.
    expect(parsePath('a.0.b')).toEqual(['a', '0', 'b']);
  });

  it('sorun satırından yolu ayıklar', () => {
    expect(pathFromIssue('layers[1].source.r: sıfırdan büyük olmalı')).toEqual([
      'layers',
      1,
      'source',
      'r',
    ]);
  });

  it('samePath uzunluk ve içeriği karşılaştırır', () => {
    expect(samePath(['a', 1], ['a', 1])).toBe(true);
    expect(samePath(['a', 1], ['a', 2])).toBe(false);
    expect(samePath(['a'], ['a', 1])).toBe(false);
  });
});
