import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHapticsEnabled, setHapticsDriver, setHapticsEnabled } from '@volstudio/core/platform';
import { buildSesTab } from '../../src/sections/sesTab';

/** Ses laboratuvarı: sonda, kanal göstergeleri ve yaşam döngüsü (ses bağlamı olmayan ortamda). */
describe('ses laboratuvarı', () => {
  let tab: ReturnType<typeof buildSesTab>;

  const readout = (key: string): string =>
    tab.element.querySelector<HTMLElement>(`[data-ses="${key}"]`)?.textContent ?? '';
  const click = (selector: string): void => {
    const element = tab.element.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Bulunamadı: ${selector}`);
    element.click();
  };

  beforeEach(() => {
    tab = buildSesTab();
    document.body.appendChild(tab.element);
  });

  afterEach(() => {
    tab.destroy();
    document.body.replaceChildren();
  });

  it('her olay için bir düğme ve gerçek bileşenler vardır', () => {
    expect(tab.element.querySelectorAll('[data-ses-event]')).toHaveLength(23);
    expect(tab.element.querySelectorAll('[data-ses-outcome]')).toHaveLength(3);
  });

  it('sonda her kabul edilmiş niyeti TEK sayar; ses bağlamı olmasa da', () => {
    expect(readout('probe-total')).toContain(': 0');
    click('[data-ses-comp="press"]');
    expect(readout('probe-total')).toContain(': 1');
    expect(readout('probe-press')).toBe('press: 1');
    click('[data-ses-comp="toggle"] input');
    expect(readout('probe-toggle')).toBe('toggle: 1');
    click('[data-ses-comp="press"]');
    expect(readout('probe-total')).toContain(': 3');
    expect(readout('probe-last')).toContain('Button');
  });

  it('olay ve kuru/kit düğmeleri doğrudan çalar: niyet üretmez, sayım çoğalmaz', () => {
    click('[data-ses-event="press"]');
    click('[data-ses="kit"]');
    click('[data-ses="dry"]');
    expect(readout('probe-total')).toContain(': 0');
  });

  it('ürün sonucu yalnız host bildirince sayılır', () => {
    expect(readout('probe-outcomes')).toContain(': 0');
    click('[data-ses-outcome="success"]');
    expect(readout('probe-outcomes')).toContain(': 1');
    // Düğmenin kendi tıklaması da bir niyettir (press); sonuç ayrıca bildirilir.
    expect(readout('probe-press')).toBe('press: 1');
    click('[data-ses-outcome="error"]');
    expect(readout('probe-outcomes')).toContain(': 2');
  });

  it('ses desteklenmeyen ortamda durum dürüsttür ve düğmeler hata vermez', () => {
    expect(typeof AudioContext).toBe('undefined');
    expect(readout('state')).toContain('ses desteklenmiyor');
    expect(readout('context')).toContain('bu ortamda yok');
    expect(() => click('[data-ses="kit"]')).not.toThrow();
    expect(() => click('[data-ses="dry"]')).not.toThrow();
    expect(readout('voices')).toContain('0 / 4');
  });

  it('kanal göstergeleri sessizleştirmeyle sıfırlanır ve geri döner', () => {
    expect(readout('gain-ui')).toContain('0.80');
    const muted = tab.element.querySelector<HTMLInputElement>('[data-ses="mute"] input');
    if (!muted) throw new Error('Sessizleştirme onay kutusu yok');
    muted.checked = true;
    muted.dispatchEvent(new Event('change', { bubbles: true }));
    expect(readout('gain-ui')).toContain('0.00');
    expect(readout('gain-sfx')).toContain('0.00');
    muted.checked = false;
    muted.dispatchEvent(new Event('change', { bubbles: true }));
    expect(readout('gain-ui')).toContain('0.80');
  });

  it('destroy niyet veriyolunu serbest bırakır ve sonda artık saymaz', () => {
    const button = tab.element.querySelector<HTMLElement>('[data-ses-comp="press"]');
    const total = tab.element.querySelector<HTMLElement>('[data-ses="probe-total"]');
    button?.click();
    expect(total?.textContent).toContain(': 1');
    tab.destroy();
    // Sökülmüş sekmenin bileşeni tıklanınca niyet üretmez, sonda değişmez.
    button?.click();
    expect(total?.textContent).toContain(': 1');
    // İkinci destroy güvenlidir.
    expect(() => tab.destroy()).not.toThrow();
  });

  it('titreşim varsayılan kapalıdır; açılınca niyet başına TEK darbe üretir ve kapanışta eski duruma döner', () => {
    const play = vi.fn();
    setHapticsDriver({ play, cancel: vi.fn() });
    try {
      expect(isHapticsEnabled()).toBe(false);
      expect(readout('haptics')).toContain('kapalı');
      click('[data-ses-comp="press"]');
      expect(play).not.toHaveBeenCalled();
      const toggle = tab.element.querySelector<HTMLInputElement>(
        '[data-ses="haptics-toggle"] input',
      );
      if (!toggle) throw new Error('Titreşim onay kutusu yok');
      toggle.checked = true;
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
      expect(isHapticsEnabled()).toBe(true);
      expect(readout('haptics')).toContain('açık');
      click('[data-ses-comp="press"]');
      expect(play).toHaveBeenCalledTimes(1);
      tab.destroy();
      expect(isHapticsEnabled()).toBe(false);
    } finally {
      setHapticsEnabled(false);
      setHapticsDriver(null);
    }
  });
});
