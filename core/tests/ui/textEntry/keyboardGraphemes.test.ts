import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { OnScreenKeyboard } from '../../../src/ui/textEntry/OnScreenKeyboard';

/**
 * Ekran klavyesi grafem sözleşmesi (UI-11.1): imleç ve geri silme KOD NOKTASINA değil kullanıcının gördüğü tek
 * karaktere göre ilerler; `maxLength` HTML gibi UTF-16 kod birimi sayar; parola grafem başına bir nokta gösterir.
 */
const ZWJ = '\u{200D}';
const FAMILY = ['\u{1F468}', '\u{1F469}', '\u{1F467}'].join(ZWJ);
const FLAG_TR = '\u{1F1F9}\u{1F1F7}';
const E_ACUTE_DECOMPOSED = 'e\u{0301}';

const key = (selector: string): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>(`.vol-osk__key${selector}`);
  expect(found, `tuş yok: ${selector}`).not.toBeNull();
  return found!;
};
const press = (selector: string): void => key(selector).click();
const shown = (): string => document.querySelector('.vol-osk__value')?.textContent ?? '';
const counter = (): string => document.querySelector('.vol-osk__counter')?.textContent ?? '';

afterEach(async () => {
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

describe('ekran klavyesi grafem düzenlemesi', () => {
  it('geri silme ZWJ’li aile emojisini TEK basışla siler; yarım emoji kalmaz', async () => {
    const pending = OnScreenKeyboard.open({ value: `a${FAMILY}` });
    press('[data-action="backspace"]');
    expect(shown().trim()).toBe('a');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: 'a', canceled: false });
  });

  it('geri silme bayrağı ve ayrışık vurgulu harfi bütün olarak siler', async () => {
    const pending = OnScreenKeyboard.open({ value: `${FLAG_TR}${E_ACUTE_DECOMPOSED}` });
    press('[data-action="backspace"]');
    expect(shown().trim()).toBe(FLAG_TR);
    press('[data-action="backspace"]');
    expect(shown().trim()).toBe('');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: '', canceled: false });
  });

  it('oklar tek adımda bir kümeyi geçer; aralarına yazma kümeyi bölmez', async () => {
    const pending = OnScreenKeyboard.open({ value: `${FAMILY}${FLAG_TR}` });
    press('[data-action="left"]');
    press('[data-action="left"]');
    press('[data-value="x"]');
    expect(shown()).toBe(`x${FAMILY}${FLAG_TR}`);
    press('[data-action="right"]');
    press('[data-value="y"]');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({
      value: `x${FAMILY}y${FLAG_TR}`,
      canceled: false,
    });
  });

  it('imleç uçlarda durur: sağda uçta sağ ok ve baştaki geri silme değeri değiştirmez', async () => {
    const pending = OnScreenKeyboard.open({ value: FAMILY });
    press('[data-action="right"]');
    press('[data-action="left"]');
    press('[data-action="left"]');
    press('[data-action="backspace"]');
    expect(shown().trim()).toBe(FAMILY);
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: FAMILY, canceled: false });
  });

  it('maxLength UTF-16 kod birimi sayar: sayaç ve ret alanın kendi sınırıyla aynıdır', async () => {
    // FAMILY 8 kod birimidir (3 emoji × 2 + 2 ZWJ); sınır 9 → bir harf sığar, ikincisi sığmaz.
    expect(FAMILY.length).toBe(8);
    const pending = OnScreenKeyboard.open({ value: FAMILY, maxLength: 9 });
    expect(counter()).toBe('8 / 9');
    press('[data-value="a"]');
    expect(counter()).toBe('9 / 9');
    press('[data-value="b"]');
    expect(counter()).toBe('9 / 9');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: `${FAMILY}a`, canceled: false });
  });

  it('parola grafem başına bir nokta gösterir; değer maskesiz döner', async () => {
    const pending = OnScreenKeyboard.open({
      value: `${FAMILY}${E_ACUTE_DECOMPOSED}`,
      purpose: 'password',
    });
    expect(shown().trim()).toBe('••');
    press('[data-action="left"]');
    press('[data-value="z"]');
    expect(shown().trim()).toBe('•••');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({
      value: `${FAMILY}z${E_ACUTE_DECOMPOSED}`,
      canceled: false,
    });
  });
});
