import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '../../src/i18n/I18n';

/**
 * Sayıya bağlı cümleler i18next'in yerel çoğul anahtarlarını (`anahtar_one`/`anahtar_other`, kategoriler
 * `Intl.PluralRules`tan) kullanır; kodda `n === 1 ? a : b` seçimi yoktur (UI-07.2). İngilizce "1 markers" ve
 * elle çoğul çifti (`unsavedOne`/`unsavedMany`) bu testten önce vardı. Bileşen düzeyi kanıt:
 * `settingsModel.test.ts` (ayar durum satırı) ve `minimapPanel.test.ts` (okuyucu özeti).
 */
afterEach(async () => {
  await i18next.changeLanguage('tr');
});

describe('çoğul biçimleri', () => {
  it('İngilizce: 0 / 1 / çok ve binlik ayırıcı', async () => {
    await i18next.changeLanguage('en');
    const t = (count: number) =>
      i18next.t('core:minimap.summary', { label: 'Map', count, zoom: 1 });
    expect(t(0)).toBe('Map: 0 markers, zoom 1x');
    expect(t(1)).toBe('Map: 1 marker, zoom 1x');
    expect(t(2)).toBe('Map: 2 markers, zoom 1x');
    expect(t(123456)).toBe('Map: 123,456 markers, zoom 1x');
  });

  it('Türkçe: sayıdan sonra tekil kalır, 6 hane yerel ayırıcıyla', async () => {
    await i18next.changeLanguage('tr');
    const t = (count: number) =>
      i18next.t('core:minimap.summary', { label: 'Harita', count, zoom: 2 });
    expect(t(0)).toBe('Harita: 0 işaret, yakınlaştırma 2x');
    expect(t(1)).toBe('Harita: 1 işaret, yakınlaştırma 2x');
    expect(t(123456)).toBe('Harita: 123.456 işaret, yakınlaştırma 2x');
  });

  it('ayar formu: kaydedilmemiş değişiklik sayısı iki dilde 1 ve çok', async () => {
    const unsaved = (count: number) => i18next.t('core:settingsForm.unsaved', { count });
    await i18next.changeLanguage('en');
    expect(unsaved(1)).toBe('1 unsaved change');
    expect(unsaved(3)).toBe('3 unsaved changes');
    await i18next.changeLanguage('tr');
    expect(unsaved(1)).toBe('1 kaydedilmemiş değişiklik');
    expect(unsaved(3)).toBe('3 kaydedilmemiş değişiklik');
  });

  it('Türkçe büyük/küçük harf: ı/İ yerel kurala göre eşlenir (CSS text-transform aynı kuralı lang ile izler)', () => {
    expect('ışık'.toLocaleUpperCase('tr')).toBe('IŞIK');
    expect('İstanbul'.toLocaleLowerCase('tr')).toBe('istanbul');
    expect('Settings'.toLocaleUpperCase('tr')).toBe('SETTİNGS');
    expect('Settings'.toLocaleUpperCase('en')).toBe('SETTINGS');
  });
});
