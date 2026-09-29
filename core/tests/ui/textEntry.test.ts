import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearTextEntryModeProbe,
  isGamepadTextEntryActive,
  requestTextEntryForElement,
  setTextEntryModeProbe,
  registerTextEntryModeProbe,
  setTextEntryProvider,
  type TextEntryRequest,
} from '../../src/ui/textEntry/textEntry';
import { triggerBack } from '../../src/platform/backNavigation';
import { OnScreenKeyboard } from '../../src/ui/textEntry/OnScreenKeyboard';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function pressKey(selector: string): void {
  const key = document.querySelector<HTMLButtonElement>(`.vol-osk__key${selector}`);
  expect(key, `tuş bulunamadı: ${selector}`).not.toBeNull();
  key!.click();
}

describe('textEntry — kolla metin girişi', () => {
  let input: HTMLInputElement;
  const probe = vi.fn(() => true);
  let applied: string[];

  beforeEach(() => {
    document.body.replaceChildren();
    input = document.createElement('input');
    document.body.appendChild(input);
    applied = [];
    probe.mockReset();
    probe.mockReturnValue(true);
    setTextEntryModeProbe(probe);
  });

  afterEach(() => {
    clearTextEntryModeProbe(probe);
    setTextEntryProvider(null);
    document.body.replaceChildren();
  });

  const focus = () => {
    requestTextEntryForElement(input, { apply: (v) => applied.push(v) });
  };

  it('sahne kapanınca önceki kip sahibi geri gelir; eski sahibin sökülmesi yeniyi silmez', () => {
    const stopMenu = registerTextEntryModeProbe(() => false);
    const stopGame = registerTextEntryModeProbe(() => true);
    expect(isGamepadTextEntryActive()).toBe(true);
    stopMenu();
    expect(isGamepadTextEntryActive()).toBe(true);
    stopGame();
    expect(isGamepadTextEntryActive()).toBe(true);
    probe.mockReturnValue(false);
    const stopScene = registerTextEntryModeProbe(() => true);
    stopScene();
    expect(isGamepadTextEntryActive()).toBe(false);
  });

  it('probu yoksa ya da kip kapalıysa klavye açmaz', async () => {
    clearTextEntryModeProbe(probe);
    expect(isGamepadTextEntryActive()).toBe(false);
    focus();
    await flush();
    expect(document.querySelector('.vol-osk')).toBeNull();

    probe.mockReturnValue(false);
    setTextEntryModeProbe(probe);
    focus();
    await flush();
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('kol kipindeyken odak ekran klavyesi açar ve değer apply edilir', async () => {
    input.focus();
    focus();
    await flush();
    expect(document.querySelector('.vol-osk')).not.toBeNull();

    pressKey('[data-value="v"]');
    pressKey('[data-value="o"]');
    pressKey('[data-value="l"]');
    pressKey('[data-action="done"]');
    await flush();
    expect(applied).toEqual(['vol']);
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('geri tuşu (B/Escape yığını) iptal eder — değer uygulanmaz', async () => {
    focus();
    await flush();
    pressKey('[data-value="x"]');
    triggerBack();
    await flush();
    expect(applied).toEqual([]);
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('shift Türkçe büyük harf üretir (i→İ) ve tek tuştan sonra düşer', async () => {
    focus();
    await flush();
    pressKey('[data-action="shift"]');
    pressKey('[data-value="i"]');
    pressKey('[data-value="z"]');
    pressKey('[data-action="done"]');
    await flush();
    expect(applied).toEqual(['İz']);
  });

  it('shift tuşları yeniden yaratmaz: odak aynı tuşta kalır, etiket değişir', async () => {
    focus();
    await flush();
    const shift = document.querySelector<HTMLButtonElement>('.vol-osk__key[data-action="shift"]')!;
    const letter = document.querySelector<HTMLButtonElement>('.vol-osk__key[data-value="ş"]')!;
    shift.focus();
    shift.click();
    expect(document.activeElement).toBe(shift);
    expect(letter.isConnected).toBe(true);
    expect(letter.textContent).toBe('Ş');
    expect(shift.getAttribute('aria-pressed')).toBe('true');
    letter.focus();
    letter.click();
    expect(document.activeElement).toBe(letter);
    expect(letter.textContent).toBe('ş');
  });

  it('parola ekranda maskelenir, değer olduğu gibi döner; alan sınırı aşılmaz', async () => {
    const pending = OnScreenKeyboard.open({ value: 'ab', purpose: 'password', maxLength: 3 });
    pressKey('[data-value="c"]');
    pressKey('[data-value="d"]');
    expect(document.querySelector('.vol-osk__value')?.textContent).toBe('•••');
    pressKey('[data-action="done"]');
    await expect(pending).resolves.toEqual({ value: 'abc', canceled: false });
  });

  it('alanın maxLength değeri isteğe taşınır', async () => {
    const open = vi.fn(() => Promise.resolve({ value: 'x', canceled: true }));
    setTextEntryProvider({ open });
    input.maxLength = 12;
    focus();
    await flush();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ maxLength: 12 }));
  });

  it('sağlayıcı reddederse değer değişmez ve işlenmemiş ret kalmaz', async () => {
    setTextEntryProvider({ open: () => Promise.reject(new Error('steam kapandı')) });
    focus();
    await flush();
    await flush();
    expect(applied).toEqual([]);
  });

  it('iptal başlangıç değerini döndürür (sağlayıcı sözleşmesi)', async () => {
    const pending = OnScreenKeyboard.open({ value: 'eski', multiline: false });
    pressKey('[data-value="x"]');
    triggerBack();
    await expect(pending).resolves.toEqual({ value: 'eski', canceled: true });
  });

  it('kapanınca odağı alana geri verir; bu odak klavyeyi tekrar açmaz', async () => {
    // Gerçek kablo: Input.focus kancası gibi focus olayı yardımcıyı çağırır.
    input.addEventListener('focus', () => focus());
    input.focus();
    await flush();
    expect(document.querySelector('.vol-osk')).not.toBeNull();
    pressKey('[data-action="done"]');
    await flush();
    // finally() içindeki programatik refocus suppress kümesini tüketmeli;
    // ikinci bir odak klavyeyi geri açarsa döngü bug'ı vardır.
    expect(document.querySelector('.vol-osk')).toBeNull();
    expect(document.activeElement).toBe(input);
    // jsdom odaklı elemana focus()'u tekrar olay üretmez; blur+focus zorla.
    input.blur();
    input.focus();
    await flush();
    expect(document.querySelector('.vol-osk')).not.toBeNull(); // tüketildiyse tekrar açılır
  });

  it('kayıtlı sağlayıcı varsa ekran klavyesi yerine o çağrılır', async () => {
    const requests: TextEntryRequest[] = [];
    setTextEntryProvider({
      open: (req) => {
        requests.push(req);
        return Promise.resolve({ value: 'steam', canceled: false });
      },
    });
    input.value = 'mevcut';
    focus();
    await flush();
    expect(document.querySelector('.vol-osk')).toBeNull();
    expect(requests).toEqual([{ value: 'mevcut', multiline: undefined, purpose: undefined }]);
    expect(applied).toEqual(['steam']);
  });
});
