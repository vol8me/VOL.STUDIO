import { describe, expect, it } from 'vitest';
import { stableTarget } from '../e2e/support/axeTarget';
import { loadAxeRecords } from '../e2e/support/accessibility';

describe('axe hedefi: sayaçtan gelen kimlik kayda girmez', () => {
  it('çubuk ve dolum etiketi kimliği kimlik ailesine çevrilir', () => {
    expect(stableTarget('#vol-bar-label-5')).toBe('[id^="vol-bar-label-"]');
    expect(stableTarget('#vol-bar-label-12')).toBe('[id^="vol-bar-label-"]');
    expect(stableTarget('#vol-charge-label-1')).toBe('[id^="vol-charge-label-"]');
  });

  it('aynı aileden iki farklı sayaç aynı anahtara iner (çubuk eklemek kaydı kaydırmaz)', () => {
    expect(stableTarget('#vol-bar-label-4')).toBe(stableTarget('#vol-bar-label-9'));
  });

  it('sayaç taşımayan hedefe dokunmaz', () => {
    for (const target of [
      '.vol-text--body:nth-child(6)',
      'span[aria-label="LMB"]',
      'div[data-material="Panel"] > .vol-text--muted.vol-text',
      '#kullanici-kimligi',
      '#vol-bar-label',
    ])
      expect(stableTarget(target)).toBe(target);
  });

  it('bileşik hedefte yalnız sayaçlı kimliği çevirir', () => {
    expect(stableTarget('.kart > #vol-bar-label-3 > span')).toBe(
      '.kart > [id^="vol-bar-label-"] > span',
    );
  });

  it('kayıt dosyası ham sayaç kimliği taşımaz (sekmeye bileşen eklemek kaydı bozmasın)', () => {
    const raw = loadAxeRecords()
      .incomplete.map((record) => record.target)
      .filter((target) => stableTarget(target) !== target);
    expect(raw).toEqual([]);
  });
});
