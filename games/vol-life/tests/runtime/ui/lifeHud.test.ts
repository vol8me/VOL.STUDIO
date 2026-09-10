import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LifeHud } from '@/runtime/ui/LifeHud';
import { i18n, i18next } from '@volstudio/core';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('LifeHud', () => {
  /* Kaynaklar yüklenmeden `t()` BOŞ string döner (AGENTS Kural 2). */
  beforeAll(async () => {
    i18n.addResources('tr', 'life', tr);
    i18n.addResources('en', 'life', en);
    await i18n.init();
  }, 60_000);

  it('marka şeridini sol üste, göstergeyi sağ alta koyar', () => {
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => {} });

    const title = document.querySelector('.vol-life-hud__title');
    expect(title?.textContent).toBe('VOL.LIFE');

    const meter = document.querySelector<HTMLElement>('.vol-fps-meter');
    expect(meter).not.toBeNull();
    /* Sağ ÜST tam ekran düğmesinindir; gösterge onunla çakışmaz. */
    expect(meter?.dataset.position).toBe('bottom-right');

    hud.destroy();
  });

  it('tam ekran düğmesi sağ üstte durur ve tıklandığında niyeti bildirir', () => {
    let toggled = 0;
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => (toggled += 1) });

    const button = document.querySelector<HTMLElement>('.vol-life-hud__fullscreen');
    expect(button).not.toBeNull();
    button?.click();
    expect(toggled).toBe(1);

    hud.destroy();
  });

  /* Android tam ekran açılır; orada düğme hem anlamsız hem başparmağın yolunda. */
  it('dokunmatik yerleşimde tam ekran düğmesi HİÇ kurulmaz', () => {
    const hud = new LifeHud(undefined, {
      onToggleFullscreen: () => {},
      showFullscreenToggle: false,
    });
    expect(document.querySelector('.vol-life-hud__fullscreen')).toBeNull();
    hud.destroy();
  });

  it('setFullscreenActive düğme etiketini değiştirir', () => {
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => {} });
    const button = document.querySelector<HTMLElement>('.vol-life-hud__fullscreen');
    const before = button?.getAttribute('aria-label');
    hud.setFullscreenActive(true);
    expect(button?.getAttribute('aria-label')).not.toBe(before);
    hud.destroy();
  });

  it('kök bir erişilebilirlik grubudur', () => {
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => {} });
    const root = document.querySelector('.vol-life-hud');
    expect(root?.getAttribute('role')).toBe('group');
    expect(root?.getAttribute('aria-label')).toBeTruthy();
    hud.destroy();
  });

  /*
   * Başlık iki dilde de "VOL.LIFE"tır; "önceki metinle aynı kaldı" iddiası
   * dinleyici hiç bağlanmasa da doğru olurdu. Çeviri bu yüzden ayırt edilebilir
   * bir değere çekilir ve YENİDEN YAZIM iddia edilir.
   */
  it('dil değişince başlığı yeniden yazar', () => {
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => {} });
    const title = document.querySelector('.vol-life-hud__title');
    const translate = vi.spyOn(i18next, 't').mockReturnValue('ÇEVRİLDİ' as never);

    i18next.emit('languageChanged', 'en');

    expect(title?.textContent).toBe('ÇEVRİLDİ');
    translate.mockRestore();
    hud.destroy();
  });

  /* Listener eklenen her yerde kaldırılır (AGENTS Kural 6). */
  it('destroy aboneliği bırakır ve DOM`u temizler', () => {
    const off = vi.spyOn(i18next, 'off');
    const hud = new LifeHud(undefined, { onToggleFullscreen: () => {} });
    expect(document.querySelector('.vol-life-hud')).not.toBeNull();

    hud.destroy();

    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    expect(document.querySelector('.vol-life-hud')).toBeNull();
    expect(document.querySelector('.vol-fps-meter')).toBeNull();
    off.mockRestore();
  });
});
