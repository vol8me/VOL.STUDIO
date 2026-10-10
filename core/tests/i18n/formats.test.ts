import { afterEach, describe, expect, it } from 'vitest';
import { i18n, i18next } from '../../src/i18n/I18n';

/**
 * Tarih / birim / yüzde biçimi (UI-07.2): kit kendi biçimleyicisini yazmaz; i18next'in yerleşik `datetime` ve
 * `number` biçimleyicileri etkin ARAYÜZ diliyle `Intl`e devredilir. Sistem yerelinden bağımsızlık kanıtı için beklenen
 * değerler `Intl`in açık dil koduyla ürettiği çıktıdır; ayrıca dillerin gerçekten FARKLI çıktı verdiği denetlenir
 * (biçimleyici sistem yerelini kullansaydı iki dil aynı çıkardı).
 */
const AT = new Date(Date.UTC(2026, 9, 10, 14, 5, 9));

afterEach(async () => {
  await i18next.changeLanguage('tr');
});

function add(key: string, value: string): void {
  for (const lng of ['tr', 'en']) i18next.addResource(lng, 'core', key, value);
}

describe('yerel biçimleyiciler', () => {
  it('datetime: tarih ve saat arayüz diline göre biçimlenir', async () => {
    add('fmt.when', '{{at, datetime(dateStyle: medium; timeStyle: short; timeZone: UTC)}}');
    const expected = (lng: string) =>
      new Intl.DateTimeFormat(lng, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(AT);
    await i18next.changeLanguage('tr');
    const tr = i18n.tDynamic('fmt.when', { at: AT });
    await i18next.changeLanguage('en');
    const en = i18n.tDynamic('fmt.when', { at: AT });
    expect(tr).toBe(expected('tr'));
    expect(en).toBe(expected('en'));
    expect(tr).not.toBe(en);
    expect(tr).toContain('Eki');
    expect(en).toContain('Oct');
  });

  it('number(unit): saniye / yüzde birimi yerel kalıpla yazılır', async () => {
    add('fmt.cooldown', '{{n, number(style: unit; unit: second; unitDisplay: narrow)}}');
    add('fmt.zoom', '{{zoom, number(style: percent)}}');
    const unit = (lng: string, n: number) =>
      new Intl.NumberFormat(lng, { style: 'unit', unit: 'second', unitDisplay: 'narrow' }).format(
        n,
      );
    const percent = (lng: string, z: number) =>
      new Intl.NumberFormat(lng, { style: 'percent' }).format(z);
    for (const lng of ['tr', 'en']) {
      await i18next.changeLanguage(lng);
      expect(i18n.tDynamic('fmt.cooldown', { n: 3 })).toBe(unit(lng, 3));
      expect(i18n.tDynamic('fmt.zoom', { zoom: 1.25 })).toBe(percent(lng, 1.25));
    }
    // Türkçede yüzde işareti sayıdan ÖNCE gelir, İngilizcede sonra: elle "{{n}}%" birleştirmesi bunu yanlış yazar.
    await i18next.changeLanguage('tr');
    expect(i18n.tDynamic('fmt.zoom', { zoom: 1 })).toMatch(/^%\s?100$/);
    await i18next.changeLanguage('en');
    expect(i18n.tDynamic('fmt.zoom', { zoom: 1 })).toBe('100%');
  });

  it('number: 6 haneli sayı yerel ayırıcıyla, uzunluk birimi kısa gösterimle', async () => {
    add('fmt.distance', '{{d, number(style: unit; unit: kilometer; unitDisplay: short)}}');
    await i18next.changeLanguage('en');
    expect(i18n.tDynamic('fmt.distance', { d: 123456 })).toBe('123,456 km');
    await i18next.changeLanguage('tr');
    expect(i18n.tDynamic('fmt.distance', { d: 123456 })).toBe('123.456 km');
  });
});
