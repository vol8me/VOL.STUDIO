import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../src/i18n/I18n';
import { ChargeButton } from '../../src/ui/buttons/ChargeButton';

/**
 * Şarj yüzdesinin ekran okuyucuya duyurulması (UI-03.2). Karar: çekirdek, opt-in `announce` ile
 * kibar bir canlı bölge sunar; yüzde 25'lik adımlarla (kare başına değil) ve tam dolumda duyurur,
 * bırakış/iptalde bölge temizlenir. Kapalıyken DOM'a hiçbir şey eklenmez.
 */
let now = 0;

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const status = (button: ChargeButton): HTMLElement | null =>
  button.element.querySelector<HTMLElement>('[role="status"]');

/** Basılı tutmayı `ms` kadar ilerletir ve her karede yazılan duyuru metnini toplar. */
function holdFor(button: ChargeButton, ms: number): string[] {
  const heard: string[] = [];
  const region = status(button)!;
  let last = '';
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    now += 16;
    vi.advanceTimersByTime(16);
    const text = region.textContent ?? '';
    if (text !== last) heard.push(text);
    last = text;
  }
  return heard;
}

const press = (button: ChargeButton): void => {
  button.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
};
const release = (button: ChargeButton): void => {
  button.element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
};

describe('ChargeButton okuyucu duyurusu', () => {
  it('varsayılan kapalı: canlı bölge ve ad bağı eklenmez', () => {
    const button = new ChargeButton({ label: 'Ateş', chargeDurationMs: 1000 });
    document.body.append(button.element);
    expect(status(button)).toBeNull();
    expect(button.element.hasAttribute('aria-labelledby')).toBe(false);
    button.destroy();
  });

  it('opt-in: kibar atomik canlı bölge; düğmenin adı etikettir, bölge ada karışmaz', () => {
    const button = new ChargeButton({ label: 'Ateş', chargeDurationMs: 1000, announce: true });
    document.body.append(button.element);
    const region = status(button)!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    const labelId = button.element.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe('Ateş');
    button.destroy();
  });

  it('başlangıçta, %25/%50/%75 ve tam dolumda tam bir kez duyurur (kare başına değil)', () => {
    const button = new ChargeButton({ chargeDurationMs: 1000, announce: true });
    document.body.append(button.element);
    press(button);
    const heard = holdFor(button, 1300);
    expect(heard).toEqual([
      i18next.t('core:chargeButton.start'),
      i18next.t('core:chargeButton.percent', { percent: 25 }),
      i18next.t('core:chargeButton.percent', { percent: 50 }),
      i18next.t('core:chargeButton.percent', { percent: 75 }),
      i18next.t('core:chargeButton.ready'),
    ]);
    release(button);
    button.destroy();
  });

  it('bırakışta ve iptalde bölge temizlenir; yeni dolum yeniden duyurur', () => {
    const button = new ChargeButton({ chargeDurationMs: 1000, announce: true });
    document.body.append(button.element);
    press(button);
    holdFor(button, 600);
    release(button);
    expect(status(button)!.textContent).toBe('');

    press(button);
    expect(status(button)!.textContent).toBe(i18next.t('core:chargeButton.start'));
    button.cancel();
    expect(status(button)!.textContent).toBe('');
    button.destroy();
  });

  it('duyuru geri çağrıları ve dolum sözleşmesini değiştirmez', () => {
    const onCharged = vi.fn();
    const onRelease = vi.fn();
    const button = new ChargeButton({
      chargeDurationMs: 1000,
      announce: true,
      onCharged,
      onRelease,
    });
    document.body.append(button.element);
    press(button);
    holdFor(button, 1100);
    release(button);
    expect(onCharged).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledWith(1);
    button.destroy();
  });
});
