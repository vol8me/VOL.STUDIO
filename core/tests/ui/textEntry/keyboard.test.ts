import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { uiIntentBusFor, type UiIntent } from '../../../src/ui/feedback/uiIntent';
import { OnScreenKeyboard } from '../../../src/ui/textEntry/OnScreenKeyboard';
import { triggerBack } from '../../../src/platform/backNavigation';

/**
 * Ekran klavyesi sözleşmesi: gerçek imleç, sembol katmanı, dile göre düzen, niyet/ses kapsamı
 * (klavye kayıtlı UI köküne girer), sınır reddi ve erişilebilir adlar.
 */
const key = (selector: string): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>(`.vol-osk__key${selector}`);
  expect(found, `tuş yok: ${selector}`).not.toBeNull();
  return found!;
};
const press = (selector: string): void => key(selector).click();
const shown = (): string => document.querySelector('.vol-osk__value')?.textContent ?? '';

afterEach(async () => {
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

describe('ekran klavyesi imleci', () => {
  it('imleç sola taşınınca yazma ve silme imleç konumunda olur', async () => {
    const pending = OnScreenKeyboard.open({ value: 'ac' });
    press('[data-action="left"]');
    press('[data-value="b"]');
    expect(shown()).toBe('abc');
    press('[data-action="left"]');
    press('[data-action="backspace"]');
    expect(shown()).toBe('bc');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: 'bc', canceled: false });
  });

  it('imleç uçlarda durur ve baştaki silme değeri değiştirmez', async () => {
    const pending = OnScreenKeyboard.open({ value: 'x' });
    press('[data-action="right"]');
    press('[data-action="left"]');
    press('[data-action="left"]');
    press('[data-action="backspace"]');
    expect(shown()).toBe('x');
    press('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: 'x', canceled: false });
  });

  it('vazgeç tuşu başlangıç değerini döndürür', async () => {
    const pending = OnScreenKeyboard.open({ value: 'eski' });
    press('[data-value="z"]');
    press('[data-action="cancel"]');
    await expect(pending).resolves.toEqual({ value: 'eski', canceled: true });
  });
});

describe('ekran klavyesi katmanları ve düzeni', () => {
  it('sembol katmanı @ ve ₺ verir, harf katmanına dönülür ve odak katman tuşunda kalır', async () => {
    const pending = OnScreenKeyboard.open({ value: '' });
    const toggle = key('[data-action="symbols"]');
    toggle.focus();
    toggle.click();
    expect(document.activeElement).toBe(key('[data-action="letters"]'));
    expect(document.querySelector('.vol-osk__key[data-value="q"]')).toBeNull();
    press('[data-value="@"]');
    press('[data-value="₺"]');
    key('[data-action="letters"]').click();
    press('[data-value="a"]');
    expect(shown().trim()).toBe('@₺a');
    press('[data-action="done"]');
    await expect(pending).resolves.toMatchObject({ value: '@₺a' });
  });

  it('arayüz dili İngilizceyse QWERTY düzeni ve i→I büyük harf kuralı kullanılır', async () => {
    await i18next.changeLanguage('en');
    const pending = OnScreenKeyboard.open({ value: '' });
    expect(document.querySelector('.vol-osk__key[data-value="ş"]')).toBeNull();
    press('[data-action="shift"]');
    press('[data-value="i"]');
    press('[data-action="done"]');
    await expect(pending).resolves.toMatchObject({ value: 'I' });
  });

  it('açıkken dil Türkçeye dönünce düzen yeniden kurulur ve odak korunur', async () => {
    await i18next.changeLanguage('en');
    void OnScreenKeyboard.open({ value: '' });
    key('[data-value="q"]').focus();
    await i18next.changeLanguage('tr');
    expect(document.querySelector('.vol-osk__key[data-value="ş"]')).not.toBeNull();
    expect(document.activeElement).toBe(key('[data-value="q"]'));
  });

  it('çok satırlı istekte yeni satır tuşu vardır, tek satırda yoktur', () => {
    void OnScreenKeyboard.open({ value: '', multiline: true });
    expect(document.querySelector('.vol-osk__key[data-action="newline"]')).not.toBeNull();
    triggerBack();
    void OnScreenKeyboard.open({ value: '' });
    expect(document.querySelector('.vol-osk__key[data-action="newline"]')).toBeNull();
  });
});

describe('ekran klavyesi erişilebilirliği ve sayacı', () => {
  it('diyalog başlığına bağlıdır; simge tuşlarının adı vardır; değer alanı salt okunur metin kutusudur', () => {
    void OnScreenKeyboard.open({ value: '', maxLength: 8, purpose: 'password' });
    const dialog = document.querySelector('.vol-osk')!;
    const titleId = dialog.getAttribute('aria-labelledby')!;
    expect(document.getElementById(titleId)?.textContent).toBe(
      i18next.t('core:keyboard.title.password'),
    );
    for (const action of ['shift', 'backspace', 'left', 'right', 'symbols']) {
      expect(key(`[data-action="${action}"]`).getAttribute('aria-label')).toBeTruthy();
    }
    const value = document.querySelector('.vol-osk__value')!;
    expect(value.getAttribute('role')).toBe('textbox');
    expect(value.getAttribute('aria-readonly')).toBe('true');
    expect(document.querySelector('.vol-osk__counter')?.textContent).toBe('0 / 8');
  });

  it('sayaç yazdıkça güncellenir ve sınır dolunca yazma reddedilir', async () => {
    const pending = OnScreenKeyboard.open({ value: 'ab', maxLength: 3 });
    press('[data-value="c"]');
    press('[data-value="d"]');
    expect(document.querySelector('.vol-osk__counter')?.textContent).toBe('3 / 3');
    press('[data-action="done"]');
    await expect(pending).resolves.toMatchObject({ value: 'abc' });
  });
});

describe('ekran klavyesi niyetleri (ses ve titreşim kapsamı)', () => {
  const setup = () => {
    const root = document.createElement('div');
    const trigger = document.createElement('button');
    root.append(trigger);
    document.body.append(root);
    const handle = uiIntentBusFor(root);
    const seen: UiIntent[] = [];
    handle.bus.subscribe({ onIntent: (intent) => seen.push(intent) });
    trigger.focus();
    return { root, seen };
  };

  it('klavye açıldığı kayıtlı UI köküne girer; tuşlar tür, silme, seçim, geçiş ve onay niyeti üretir', async () => {
    const { root, seen } = setup();
    const pending = OnScreenKeyboard.open({ value: '' });
    expect(document.querySelector('.vol-osk')?.parentElement).toBe(root);
    press('[data-value="a"]');
    press('[data-action="backspace"]');
    press('[data-action="shift"]');
    press('[data-action="symbols"]');
    press('[data-action="left"]');
    press('[data-action="done"]');
    await pending;
    expect(seen.map((intent) => intent.kind)).toEqual([
      'type',
      'erase',
      'toggle',
      'select',
      'confirm',
    ]);
    expect(new Set(seen.map((intent) => intent.origin))).toEqual(new Set(['OnScreenKeyboard']));
  });

  it('sınır dolu yazma reject, vazgeç cancel niyeti verir; sınırda ve uçta boş eylem sessizdir', async () => {
    const { seen } = setup();
    const pending = OnScreenKeyboard.open({ value: 'a', maxLength: 1 });
    press('[data-value="b"]');
    press('[data-action="right"]');
    press('[data-action="cancel"]');
    await pending;
    expect(seen.map((intent) => intent.kind)).toEqual(['reject', 'cancel']);
  });

  it('kök yoksa klavye gövdeye eklenir ve niyet yayılmaz', () => {
    void OnScreenKeyboard.open({ value: '' });
    expect(document.querySelector('.vol-osk')?.parentElement).toBe(document.body);
    press('[data-value="a"]');
    expect(shown().trim()).toBe('a');
  });
});
