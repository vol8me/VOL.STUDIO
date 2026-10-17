import { afterEach, describe, expect, it } from 'vitest';
import { i18n, i18next } from '@volstudio/core/i18n';
import {
  PSEUDO_LOCALE,
  applyDirectionFromUrl,
  applyPseudoLocaleFromUrl,
} from '../src/pseudoLocale';
import { pseudoize } from '../src/pseudoize';
import enResources from '../src/i18n/en.json';

/**
 * Sahte dil deterministik ve %30 uzundur; `{{değişken}}` korunur. URL anahtarları kapalıyken hiçbir şeye dokunmaz.
 */
describe('pseudoize', () => {
  it('harfleri aksanlar, sarar ve en az %30 uzatır', () => {
    const source = 'Open keyboard';
    const result = pseudoize(source);
    expect(result.startsWith('⟦')).toBe(true);
    expect(result.endsWith('⟧')).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(Math.ceil(source.length * 1.3));
    expect(result).not.toContain('keyboard');
    expect(pseudoize(source)).toBe(result);
  });

  it('{{değişken}} adlarını bozmaz ve büyük/küçük harf ayrımını korur', () => {
    expect(pseudoize('Hello {{name}}!')).toContain('{{name}}');
    expect(pseudoize('Ab')).toContain('Á');
    expect(pseudoize('Ab')).toContain('ƀ');
  });
});

describe('URL anahtarları', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dir');
  });

  it('?dir=rtl belge yönünü çevirir; anahtar yoksa dokunmaz', () => {
    applyDirectionFromUrl('?x=1');
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
    applyDirectionFromUrl('?dir=rtl');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('?lang=pseudo İngilizce kaynaklardan sahte dili kurar ve ona geçer; anahtar yoksa geçmez', async () => {
    i18n.addResources('en', 'volui', enResources);
    await i18n.init();
    expect(await applyPseudoLocaleFromUrl('?lang=en')).toBe(false);
    expect(await applyPseudoLocaleFromUrl('?lang=pseudo')).toBe(true);
    expect(i18next.language).toBe(PSEUDO_LOCALE);
    const label = i18next.t('volui:panels.openPopup');
    expect(label).toBe(pseudoize('Open Popup'));
    expect(i18next.t('core:confirm.yes')).toBe(pseudoize('Yes'));
    await i18n.changeLanguage('en');
  });
});
