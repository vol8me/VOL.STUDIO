import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTextEntryModeProbe,
  requestGamepadTextEntry,
  setTextEntryModeProbe,
  setTextEntryProvider,
  type TextEntryProvider,
  type TextEntryRequest,
  type TextEntryResult,
} from '../../../src/ui/textEntry/textEntry';
import { triggerBack } from '../../../src/platform/backNavigation';

/**
 * `requestGamepadTextEntry` doğrudan: kip kapıyı, iptal sinyalini, sağlayıcı önceliğini ve ekran klavyesi yedeğini
 * belirler. Alan sahipliği (`requestTextEntryForElement`) `textEntry.test.ts` ve `session.test.ts`tedir.
 */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('requestGamepadTextEntry', () => {
  const probe = vi.fn(() => true);
  const request: TextEntryRequest = { value: 'ab', purpose: 'search', maxLength: 5 };

  beforeEach(() => {
    document.body.replaceChildren();
    probe.mockReset();
    probe.mockReturnValue(true);
    setTextEntryModeProbe(probe);
  });

  afterEach(() => {
    clearTextEntryModeProbe(probe);
    setTextEntryProvider(null);
    document.body.replaceChildren();
  });

  const provider = (
    result: TextEntryResult,
  ): { open: ReturnType<typeof vi.fn> } & TextEntryProvider => ({
    open: vi.fn(() => Promise.resolve(result)),
  });

  it('kol kipi kapalıyken null döner ve hiçbir klavye açılmaz (sağlayıcı da çağrılmaz)', async () => {
    const custom = provider({ value: 'x', canceled: false });
    setTextEntryProvider(custom);
    probe.mockReturnValue(false);

    await expect(requestGamepadTextEntry(request)).resolves.toBeNull();
    expect(custom.open).not.toHaveBeenCalled();
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('prob hiç kayıtlı değilse kip kapalı sayılır', async () => {
    clearTextEntryModeProbe(probe);
    await expect(requestGamepadTextEntry(request)).resolves.toBeNull();
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('iptal edilmiş sinyalle çağrı null döner ve sağlayıcıya ulaşmaz', async () => {
    const custom = provider({ value: 'x', canceled: false });
    setTextEntryProvider(custom);
    const controller = new AbortController();
    controller.abort();

    await expect(requestGamepadTextEntry(request, controller.signal)).resolves.toBeNull();
    expect(custom.open).not.toHaveBeenCalled();
  });

  it('kayıtlı sağlayıcı isteği ve sinyali olduğu gibi alır; sonucu aynen döndürür, ekran klavyesi açılmaz', async () => {
    const custom = provider({ value: 'sonuç', canceled: false });
    setTextEntryProvider(custom);
    const controller = new AbortController();

    const result = await requestGamepadTextEntry(request, controller.signal);

    expect(result).toEqual({ value: 'sonuç', canceled: false });
    expect(custom.open).toHaveBeenCalledTimes(1);
    expect(custom.open).toHaveBeenCalledWith(request, controller.signal);
    expect(document.querySelector('.vol-osk')).toBeNull();
  });

  it('sağlayıcı yoksa çekirdeğin ekran klavyesi açılır; Tamam girilen değeri, geri tuşu başlangıç değerini döndürür', async () => {
    const pressed = requestGamepadTextEntry({ value: '' });
    await flush();
    document.querySelector<HTMLButtonElement>('.vol-osk__key[data-value="v"]')?.click();
    document.querySelector<HTMLButtonElement>('.vol-osk__key[data-action="done"]')?.click();
    await expect(pressed).resolves.toEqual({ value: 'v', canceled: false });
    await flush();
    expect(document.querySelector('.vol-osk')).toBeNull();

    const canceled = requestGamepadTextEntry({ value: 'ab' });
    await flush();
    expect(document.querySelector('.vol-osk')).not.toBeNull();
    triggerBack();
    await expect(canceled).resolves.toEqual({ value: 'ab', canceled: true });
  });

  it('sağlayıcının reddi çağırana ulaşır (sessizce yutulmaz); alan sarmalayıcısı bunu işler', async () => {
    const failing: TextEntryProvider = { open: () => Promise.reject(new Error('platform')) };
    setTextEntryProvider(failing);
    await expect(requestGamepadTextEntry(request)).rejects.toThrow('platform');
  });
});
